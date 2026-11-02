import { AppError, ErrorIds } from '@/constants/errorIds'
import type { ImportExceptionKind } from '@/features/gis/exceptionKinds'
import type { SourceFeature } from '@/features/gis/import/types'
import type { IdField, LayerMapping } from '@/features/gis/layerMapping'
import { checkIdFormat, type IdFormat } from '@/features/parcels/idFormats'

export interface IdValue {
  format: string
  value: string
}

export interface PreparedRow {
  rowKey: string
  primary: IdValue | null
  extras: IdValue[]
  siteAddress: string | null
  ownerName: string | null
  mailingAddress: string | null
  geometries: GeoJSON.Geometry[]
  partsMissingGeometry: number
  rowRefs: string[]
  properties: SourceFeature['properties']
  failure: { kind: ImportExceptionKind; detail: string } | null
}

type Props = SourceFeature['properties']
type IdOutcome =
  | { ok: true; value: IdValue | null }
  | { ok: false; kind: ImportExceptionKind; detail: string }

function blank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

function textOf(props: Props, field: string): string | null {
  const v = props[field]
  if (blank(v)) return null
  return String(v).trim()
}

function joinFields(props: Props, fields: string[] | undefined): string | null {
  if (fields === undefined) return null
  const parts = fields.map((f) => textOf(props, f)).filter((p): p is string => p !== null)
  return parts.length === 0 ? null : parts.join(' ')
}

function readId(props: Props, field: IdField, formats: Map<string, IdFormat>): IdOutcome {
  const format = formats.get(field.format)
  if (format === undefined) {
    throw new AppError(ErrorIds.CFG_SCHEMA_FAIL, 'Mapping names an unknown id format', {
      format: field.format,
    })
  }
  const raw = props[field.field]
  if (blank(raw)) return { ok: true, value: null }
  let text = String(raw).trim()
  if (typeof raw === 'number') {
    if (!field.padNumeric) {
      return {
        ok: false,
        kind: 'id_numeric_lost_zeros',
        detail: `${field.field} arrived as the number ${text}`,
      }
    }
    text = format.width === null ? text : text.padStart(format.width, '0')
  }
  const checked = checkIdFormat(format, text)
  if (!checked.ok) {
    return {
      ok: false,
      kind: 'id_format_mismatch',
      detail: `${field.field} value ${text} does not fit ${field.format}`,
    }
  }
  return { ok: true, value: { format: field.format, value: checked.value } }
}

function fromFeature(
  f: SourceFeature,
  mapping: LayerMapping,
  formats: Map<string, IdFormat>,
): PreparedRow {
  const base = {
    extras: [] as IdValue[],
    siteAddress: joinFields(f.properties, mapping.siteAddress?.fields),
    ownerName: mapping.ownerName === undefined ? null : textOf(f.properties, mapping.ownerName),
    mailingAddress: joinFields(f.properties, mapping.mailingAddress?.fields),
    geometries: f.geometry === null ? [] : [f.geometry],
    partsMissingGeometry: f.geometry === null ? 1 : 0,
    rowRefs: [f.rowRef],
    properties: f.properties,
  }
  const primary = readId(f.properties, mapping.primaryId, formats)
  if (!primary.ok) {
    const numeric = primary.kind === 'id_numeric_lost_zeros'
    const key = numeric ? String(f.properties[mapping.primaryId.field]) : `feature:${f.rowRef}`
    return {
      ...base,
      rowKey: `id:${key}`,
      primary: null,
      failure: { kind: primary.kind, detail: primary.detail },
    }
  }
  if (primary.value === null) {
    return {
      ...base,
      rowKey: `feature:${f.rowRef}`,
      primary: null,
      failure: { kind: 'missing_required_field', detail: `${mapping.primaryId.field} is empty` },
    }
  }
  const rowKey = `id:${primary.value.value}`
  const extras: IdValue[] = []
  for (const field of mapping.extraIds) {
    const extra = readId(f.properties, field, formats)
    if (!extra.ok) {
      return {
        ...base,
        rowKey,
        primary: primary.value,
        failure: { kind: extra.kind, detail: extra.detail },
      }
    }
    if (extra.value !== null) extras.push(extra.value)
  }
  return { ...base, rowKey, primary: primary.value, extras, failure: null }
}

function mergeInto(target: PreparedRow, other: PreparedRow): void {
  target.geometries.push(...other.geometries)
  target.partsMissingGeometry += other.partsMissingGeometry
  target.rowRefs.push(...other.rowRefs)
  for (const extra of other.extras) {
    if (!target.extras.some((e) => e.format === extra.format && e.value === extra.value)) {
      target.extras.push(extra)
    }
  }
}

export function prepareRows(
  features: SourceFeature[],
  mapping: LayerMapping,
  formats: Map<string, IdFormat>,
): PreparedRow[] {
  const rows: PreparedRow[] = []
  const byKey = new Map<string, PreparedRow>()
  for (const f of features) {
    const row = fromFeature(f, mapping, formats)
    const existing = row.failure === null ? byKey.get(row.rowKey) : undefined
    if (existing !== undefined) {
      mergeInto(existing, row)
      continue
    }
    rows.push(row)
    if (row.failure === null) byKey.set(row.rowKey, row)
  }
  return rows
}
