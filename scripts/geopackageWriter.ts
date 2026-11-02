import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import wkx from 'wkx'
import { type GridLot, NH_STATE_PLANE_FEET_WKT } from './alderPondGrid.ts'

const GPKG_APPLICATION_ID = 1196444487
const SRS_ID = 3437
const LITTLE_ENDIAN_FLAG = 0x01
const EMPTY_FLAG = 0x10

export interface GeoPackageOptions {
  extraTable: boolean
  emptyFirstGeometry: boolean
}

function geometryBlob(lot: GridLot, empty: boolean): Buffer {
  const header = Buffer.alloc(8)
  header.write('GP', 0, 'ascii')
  header[2] = 0
  header[3] = LITTLE_ENDIAN_FLAG | (empty ? EMPTY_FLAG : 0)
  header.writeInt32LE(SRS_ID, 4)
  if (empty) return header
  const polygon = new wkx.Polygon(lot.ringFt.map(([x, y]) => new wkx.Point(x, y)))
  return Buffer.concat([header, polygon.toWkb()])
}

function createFeatureTable(
  db: Database.Database,
  name: string,
  lots: GridLot[],
  opts: GeoPackageOptions,
): void {
  db.exec(
    `CREATE TABLE "${name}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB, MAPLOT TEXT, CAMA TEXT, SITE_ADDR TEXT, OWNER TEXT, MAIL_ADDR TEXT)`,
  )
  db.prepare(
    `INSERT INTO gpkg_contents (table_name, data_type, identifier, srs_id) VALUES (?, 'features', ?, ?)`,
  ).run(name, name, SRS_ID)
  db.prepare(
    `INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m) VALUES (?, 'geom', 'POLYGON', ?, 0, 0)`,
  ).run(name, SRS_ID)
  const insert = db.prepare(
    `INSERT INTO "${name}" (geom, MAPLOT, CAMA, SITE_ADDR, OWNER, MAIL_ADDR) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  lots.forEach((lot, i) => {
    insert.run(
      geometryBlob(lot, opts.emptyFirstGeometry && i === 0),
      lot.gis12,
      lot.cama[0] ?? null,
      lot.siteAddress,
      lot.owner,
      lot.mailing,
    )
  })
}

export function buildGeoPackage(
  lots: GridLot[],
  opts: GeoPackageOptions = { extraTable: false, emptyFirstGeometry: false },
): Uint8Array {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'chiban-gpkg-'))
  const file = path.join(dir, 'alder-pond.gpkg')
  try {
    const db = new Database(file)
    db.pragma(`application_id = ${GPKG_APPLICATION_ID}`)
    db.pragma('user_version = 10300')
    db.exec(
      `CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT)`,
    )
    db.exec(
      `CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT, description TEXT DEFAULT '', last_change TEXT, min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER)`,
    )
    db.exec(
      `CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL)`,
    )
    db.prepare(
      `INSERT INTO gpkg_spatial_ref_sys VALUES ('NAD83 / New Hampshire (ftUS)', ?, 'EPSG', ?, ?, NULL)`,
    ).run(SRS_ID, SRS_ID, NH_STATE_PLANE_FEET_WKT)
    createFeatureTable(db, 'parcels', lots, opts)
    if (opts.extraTable) createFeatureTable(db, 'parcels_copy', lots, opts)
    db.close()
    return new Uint8Array(readFileSync(file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
