import { parse } from 'csv-parse/sync'
import { type CamaIdPart, type CamaMapping, mappedColumns } from '@/features/cama/mapping'
import type { SourceFeature } from '@/features/gis/import/types'
import { err, ok, type Result } from '@/types/result'

export interface CamaReadError {
  kind: 'malformed'
  line: number
  detail: string
}

type Cells = ReadonlyMap<string, string>

export function decodeCama(bytes: Uint8Array, encoding: CamaMapping['encoding']): string {
  if (encoding === 'windows-1252') return new TextDecoder('windows-1252').decode(bytes)
  if (encoding === 'utf-8') return new TextDecoder('utf-8').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

function joined(cells: Cells, columns: string[], joiner: string): string | null {
  const parts = columns.map((c) => textOrNull(cells.get(c))).filter((p): p is string => p !== null)
  return parts.length === 0 ? null : parts.join(joiner)
}

function partText(cells: Cells, part: CamaIdPart): string | null {
  if ('literal' in part) return part.literal
  const raw = (cells.get(part.column) ?? '').trim()
  if (!/^\d+$/.test(raw) || raw.length > part.width) return null
  return raw.padStart(part.width, '0')
}

export function composeCamaId(cells: Cells, parts: CamaIdPart[]): string | null {
  const texts = parts.map((p) => partText(cells, p))
  return texts.every((t): t is string => t !== null) ? texts.join('') : null
}

export interface CamaFile {
  headers: string[]
  records: Cells[]
}

export function parseCamaFile(
  bytes: Uint8Array,
  mapping: CamaMapping,
): Result<CamaFile, CamaReadError> {
  let headers: string[] = []
  try {
    const records = parse(decodeCama(bytes, mapping.encoding), {
      columns: (first: string[]) => {
        headers = first.map((h) => h.trim())
        return headers
      },
      delimiter: mapping.delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[]
    return ok({ headers, records: records.map((r) => new Map(Object.entries(r))) })
  } catch (e) {
    return err({
      kind: 'malformed',
      line: 0,
      detail: e instanceof Error ? e.message : 'The file could not be parsed',
    })
  }
}

function missingColumns(headers: string[], mapping: CamaMapping): string[] {
  return mappedColumns(mapping).filter((c) => !headers.includes(c))
}

export function toSourceFeature(cells: Cells, mapping: CamaMapping, index: number): SourceFeature {
  const id = composeCamaId(cells, mapping.id.parts)
  const properties: SourceFeature['properties'] = {
    ownerName: joined(cells, mapping.ownerName.columns, mapping.ownerName.joiner),
    mailingAddress: joined(cells, mapping.mailingAddress.columns, ' '),
    siteAddress:
      mapping.siteAddress === undefined ? null : joined(cells, mapping.siteAddress.columns, ' '),
  }
  if (id !== null) properties.id = id
  return { rowRef: String(index + 2), properties, geometry: null }
}

export function readCamaCsv(
  bytes: Uint8Array,
  mapping: CamaMapping,
): Result<SourceFeature[], CamaReadError> {
  const file = parseCamaFile(bytes, mapping)
  if (!file.ok) return file
  const missing = missingColumns(file.value.headers, mapping)
  if (file.value.records.length > 0 && missing.length > 0) {
    return err({
      kind: 'malformed',
      line: 1,
      detail: `The file has no column named ${missing.join(', ')}`,
    })
  }
  return ok(file.value.records.map((row, i) => toSourceFeature(row, mapping, i)))
}
