import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import wkx from 'wkx'
import type { SourceFeature } from '@/features/gis/import/types'
import { reprojectTo4326 } from '@/features/gis/readers/reproject'
import type { ReaderError } from '@/features/gis/readers/types'
import { err, ok, type Result } from '@/types/result'

const WGS84_SRS_ID = 4326
const HEADER_BYTES = 8
const ENVELOPE_BYTES = [0, 32, 48, 48, 64]
const EMPTY_BIT = 0x10

function decodeGeometry(blob: Buffer): GeoJSON.Geometry | null | 'bad' {
  if (blob.length < HEADER_BYTES || blob.toString('ascii', 0, 2) !== 'GP') return 'bad'
  const flags = blob[3] ?? 0
  if ((flags & EMPTY_BIT) !== 0) return null
  const envelope = ENVELOPE_BYTES[(flags >> 1) & 0x07]
  if (envelope === undefined) return 'bad'
  const body = blob.subarray(HEADER_BYTES + envelope)
  try {
    return wkx.Geometry.parse(body).toGeoJSON() as GeoJSON.Geometry
  } catch {
    return 'bad'
  }
}

interface GeometryColumn {
  column_name: string
  srs_id: number
}

function sourceDefinition(
  db: Database.Database,
  srsId: number,
): Result<string | null, ReaderError> {
  if (srsId === WGS84_SRS_ID) return ok(null)
  const srs = db
    .prepare('SELECT definition FROM gpkg_spatial_ref_sys WHERE srs_id = ?')
    .get(srsId) as { definition: string } | undefined
  if (srs === undefined || srs.definition === 'undefined') {
    return err({
      kind: 'missing_projection',
      detail: `Spatial reference ${srsId} has no definition`,
    })
  }
  return ok(srs.definition)
}

function rowFeature(
  row: Record<string, unknown>,
  index: number,
  col: GeometryColumn,
  definition: string | null,
): Result<SourceFeature, ReaderError> {
  const raw = row[col.column_name]
  let geometry: GeoJSON.Geometry | null = null
  if (Buffer.isBuffer(raw)) {
    const decoded = decodeGeometry(raw)
    if (decoded === 'bad')
      return err({ kind: 'malformed', detail: `Row ${index} has an unreadable geometry` })
    geometry = decoded
  }
  if (geometry !== null && definition !== null) {
    const moved = reprojectTo4326(geometry, definition)
    if (!moved.ok) return moved
    geometry = moved.value
  }
  const properties: SourceFeature['properties'] = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === col.column_name || Buffer.isBuffer(value)) continue
    properties[key] = typeof value === 'bigint' ? Number(value) : (value as string | number | null)
  }
  const fid = row.fid
  const rowRef = typeof fid === 'number' || typeof fid === 'string' ? String(fid) : String(index)
  return ok({ rowRef, properties, geometry })
}

function readTable(db: Database.Database, table: string): Result<SourceFeature[], ReaderError> {
  const col = db
    .prepare('SELECT column_name, srs_id FROM gpkg_geometry_columns WHERE table_name = ?')
    .get(table) as GeometryColumn | undefined
  if (col === undefined)
    return err({ kind: 'malformed', detail: `Table ${table} has no geometry column` })
  const definition = sourceDefinition(db, col.srs_id)
  if (!definition.ok) return definition
  const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[]
  const out: SourceFeature[] = []
  for (const [i, row] of rows.entries()) {
    const feature = rowFeature(row, i, col, definition.value)
    if (!feature.ok) return feature
    out.push(feature.value)
  }
  return ok(out)
}

function pickTable(
  db: Database.Database,
  requested: string | undefined,
): Result<string, ReaderError> {
  const tables = (
    db.prepare("SELECT table_name FROM gpkg_contents WHERE data_type = 'features'").all() as {
      table_name: string
    }[]
  ).map((t) => t.table_name)
  if (requested !== undefined) {
    return tables.includes(requested)
      ? ok(requested)
      : err({ kind: 'malformed', detail: `No feature table named ${requested}` })
  }
  const [only] = tables
  if (tables.length === 1 && only !== undefined) return ok(only)
  if (tables.length === 0)
    return err({ kind: 'malformed', detail: 'GeoPackage has no feature tables' })
  return err({ kind: 'multiple_tables', detail: `Choose one of: ${tables.join(', ')}` })
}

function readFromBytes(
  bytes: Uint8Array,
  opts: { table?: string },
): Result<SourceFeature[], ReaderError> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'chiban-gpkg-'))
  try {
    const file = path.join(dir, 'upload.gpkg')
    writeFileSync(file, bytes)
    let db: Database.Database
    try {
      db = new Database(file, { readonly: true })
    } catch {
      return err({ kind: 'malformed', detail: 'File is not a GeoPackage' })
    }
    try {
      const table = pickTable(db, opts.table)
      if (!table.ok) return table
      return readTable(db, table.value)
    } catch {
      return err({ kind: 'malformed', detail: 'File is not a readable GeoPackage' })
    } finally {
      db.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function readGeoPackage(
  bytes: Uint8Array,
  signal: AbortSignal,
  opts: { table?: string } = {},
): Promise<Result<SourceFeature[], ReaderError>> {
  signal.throwIfAborted()
  return Promise.resolve(readFromBytes(bytes, opts))
}
