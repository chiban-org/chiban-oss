import { unzipSync } from 'fflate'
import * as shapefile from 'shapefile'
import type { SourceFeature } from '@/features/gis/import/types'
import { reprojectTo4326 } from '@/features/gis/readers/reproject'
import type { ReaderError } from '@/features/gis/readers/types'
import { err, ok, type Result } from '@/types/result'

const DEFAULT_ENCODING = 'windows-1252'

function findPart(files: Record<string, Uint8Array>, extension: string): Uint8Array | undefined {
  const key = Object.keys(files).find(
    (name) => !name.startsWith('__MACOSX') && name.toLowerCase().endsWith(extension),
  )
  return key === undefined ? undefined : files[key]
}

function encodingOf(cpg: Uint8Array | undefined): string {
  if (cpg === undefined) return DEFAULT_ENCODING
  const label = new TextDecoder().decode(cpg).trim()
  if (/^\d+$/.test(label)) return `windows-${label}`
  return label === '' ? DEFAULT_ENCODING : label
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function readShapefileZip(
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<Result<SourceFeature[], ReaderError>> {
  signal.throwIfAborted()
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    return err({ kind: 'malformed', detail: 'File is not a valid zip archive' })
  }
  const shp = findPart(files, '.shp')
  const dbf = findPart(files, '.dbf')
  if (shp === undefined || dbf === undefined) {
    return err({ kind: 'missing_part', detail: 'Zip must contain .shp and .dbf files' })
  }
  const prj = findPart(files, '.prj')
  if (prj === undefined) {
    return err({
      kind: 'missing_projection',
      detail: 'Zip has no .prj file, so coordinates cannot be placed',
    })
  }
  const wkt = new TextDecoder().decode(prj)
  let collection: GeoJSON.FeatureCollection<GeoJSON.Geometry | null>
  try {
    collection = await shapefile.read(toArrayBuffer(shp), toArrayBuffer(dbf), {
      encoding: encodingOf(findPart(files, '.cpg')),
    })
  } catch (e) {
    return err({
      kind: 'malformed',
      detail: e instanceof Error ? e.message : 'Shapefile could not be read',
    })
  }
  const out: SourceFeature[] = []
  for (const [i, f] of collection.features.entries()) {
    let geometry: GeoJSON.Geometry | null = null
    if (f.geometry !== null) {
      const moved = reprojectTo4326(f.geometry, wkt)
      if (!moved.ok) return moved
      geometry = moved.value
    }
    out.push({
      rowRef: String(i),
      properties: f.properties ?? {},
      geometry,
    })
  }
  return ok(out)
}
