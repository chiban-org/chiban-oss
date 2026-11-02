import { zipSync } from 'fflate'
import { type GridLot, NH_STATE_PLANE_FEET_WKT } from './alderPondGrid.ts'

const ENCODER = new TextEncoder()
const SHP_HEADER_BYTES = 100
const POLYGON_TYPE = 5
const FILE_CODE = 9994

interface DbfField {
  name: string
  kind: 'C' | 'N'
  length: number
}

const DBF_FIELDS: DbfField[] = [
  { name: 'MAPLOT', kind: 'C', length: 12 },
  { name: 'CAMA', kind: 'C', length: 15 },
  { name: 'SITE_ADDR', kind: 'C', length: 60 },
  { name: 'OWNER', kind: 'C', length: 60 },
  { name: 'MAIL_ADDR', kind: 'C', length: 60 },
  { name: 'LOTNUM', kind: 'N', length: 6 },
]

function shpHeader(view: DataView, totalBytes: number, box: number[]): void {
  view.setInt32(0, FILE_CODE, false)
  view.setInt32(24, totalBytes / 2, false)
  view.setInt32(28, 1000, true)
  view.setInt32(32, POLYGON_TYPE, true)
  box.forEach((v, i) => view.setFloat64(36 + i * 8, v, true))
}

function clockwise(ring: [number, number][]): [number, number][] {
  return [...ring].reverse()
}

export function buildShpAndShx(lots: GridLot[]): { shp: Uint8Array; shx: Uint8Array } {
  const rings = lots.map((l) => clockwise(l.ringFt))
  const recordBytes = rings.map((r) => 8 + 44 + 4 + 16 * r.length)
  const shpSize = SHP_HEADER_BYTES + recordBytes.reduce((a, b) => a + b, 0)
  const shxSize = SHP_HEADER_BYTES + 8 * lots.length
  const xs = rings.flat().map((p) => p[0])
  const ys = rings.flat().map((p) => p[1])
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), 0, 0, 0, 0]
  const shp = new Uint8Array(shpSize)
  const shx = new Uint8Array(shxSize)
  const sv = new DataView(shp.buffer)
  const xv = new DataView(shx.buffer)
  shpHeader(sv, shpSize, box)
  shpHeader(xv, shxSize, box)
  let offset = SHP_HEADER_BYTES
  rings.forEach((ring, i) => {
    const content = recordBytes[i] ?? 0
    xv.setInt32(SHP_HEADER_BYTES + i * 8, offset / 2, false)
    xv.setInt32(SHP_HEADER_BYTES + i * 8 + 4, (content - 8) / 2, false)
    sv.setInt32(offset, i + 1, false)
    sv.setInt32(offset + 4, (content - 8) / 2, false)
    let p = offset + 8
    sv.setInt32(p, POLYGON_TYPE, true)
    const rx = ring.map((q) => q[0])
    const ry = ring.map((q) => q[1])
    ;[Math.min(...rx), Math.min(...ry), Math.max(...rx), Math.max(...ry)].forEach((v, k) =>
      sv.setFloat64(p + 4 + k * 8, v, true),
    )
    p += 36
    sv.setInt32(p, 1, true)
    sv.setInt32(p + 4, ring.length, true)
    sv.setInt32(p + 8, 0, true)
    p += 12
    for (const [x, y] of ring) {
      sv.setFloat64(p, x, true)
      sv.setFloat64(p + 8, y, true)
      p += 16
    }
    offset += content
  })
  return { shp, shx }
}

function dbfValue(lot: GridLot, field: DbfField): string {
  const values: Record<string, string> = {
    MAPLOT: lot.gis12,
    CAMA: lot.cama[0] ?? '',
    SITE_ADDR: lot.siteAddress,
    OWNER: lot.owner,
    MAIL_ADDR: lot.mailing,
    LOTNUM: String(lot.index + 1),
  }
  const raw = values[field.name] ?? ''
  return field.kind === 'N' ? raw.padStart(field.length, ' ') : raw.padEnd(field.length, ' ')
}

export function buildDbf(lots: GridLot[]): Uint8Array {
  const headerLength = 32 + 32 * DBF_FIELDS.length + 1
  const recordLength = 1 + DBF_FIELDS.reduce((a, f) => a + f.length, 0)
  const out = new Uint8Array(headerLength + recordLength * lots.length + 1)
  const view = new DataView(out.buffer)
  out[0] = 3
  out[1] = 127
  out[2] = 1
  out[3] = 1
  view.setUint32(4, lots.length, true)
  view.setUint16(8, headerLength, true)
  view.setUint16(10, recordLength, true)
  DBF_FIELDS.forEach((f, i) => {
    const base = 32 + i * 32
    out.set(ENCODER.encode(f.name), base)
    out[base + 11] = f.kind.charCodeAt(0)
    out[base + 16] = f.length
  })
  out[32 + 32 * DBF_FIELDS.length] = 0x0d
  lots.forEach((lot, i) => {
    const base = headerLength + i * recordLength
    out[base] = 0x20
    let p = base + 1
    for (const f of DBF_FIELDS) {
      out.set(ENCODER.encode(dbfValue(lot, f)), p)
      p += f.length
    }
  })
  out[out.length - 1] = 0x1a
  return out
}

export interface ShapefileZipOptions {
  prj: boolean
}

export function buildShapefileZip(
  lots: GridLot[],
  opts: ShapefileZipOptions = { prj: true },
): Uint8Array {
  const { shp, shx } = buildShpAndShx(lots)
  const files: Record<string, Uint8Array> = {
    'alder-pond.shp': shp,
    'alder-pond.shx': shx,
    'alder-pond.dbf': buildDbf(lots),
    'alder-pond.cpg': ENCODER.encode('UTF-8'),
  }
  if (opts.prj) files['alder-pond.prj'] = ENCODER.encode(NH_STATE_PLANE_FEET_WKT)
  return zipSync(files, { mtime: new Date(2020, 0, 1, 12) })
}
