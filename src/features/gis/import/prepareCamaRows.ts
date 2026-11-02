import { z } from 'zod'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { ImportExceptionKind } from '@/features/gis/exceptionKinds'
import type { IdValue } from '@/features/gis/import/prepareRows'
import type { SourceFeature } from '@/features/gis/import/types'
import { checkIdFormat, type IdFormat } from '@/features/parcels/idFormats'

export interface PreparedCamaRow {
  rowKey: string
  id: IdValue | null
  siteAddress: string | null
  ownerName: string | null
  mailingAddress: string | null
  rowRef: string
  failure: { kind: ImportExceptionKind; detail: string } | null
}

const rowSchema = z.object({
  id: z.string().optional(),
  ownerName: z.string().nullable(),
  mailingAddress: z.string().nullable(),
  siteAddress: z.string().nullable(),
})

function failed(
  f: SourceFeature,
  kind: ImportExceptionKind,
  detail: string,
  id: IdValue | null,
): PreparedCamaRow {
  return {
    rowKey: id === null ? `line:${f.rowRef}` : `id:${id.value}`,
    id,
    siteAddress: null,
    ownerName: null,
    mailingAddress: null,
    rowRef: f.rowRef,
    failure: { kind, detail },
  }
}

function prepareOne(f: SourceFeature, formatKey: string, format: IdFormat): PreparedCamaRow {
  const parsed = rowSchema.safeParse(f.properties)
  if (!parsed.success) {
    return failed(f, 'missing_required_field', `Line ${f.rowRef} could not be read`, null)
  }
  const { id, ownerName, mailingAddress, siteAddress } = parsed.data
  if (id === undefined) {
    return failed(
      f,
      'id_format_mismatch',
      `Line ${f.rowRef} has an ID part that is not digits or is too long for the layout`,
      null,
    )
  }
  const checked = checkIdFormat(format, id)
  if (!checked.ok) {
    return failed(f, 'id_format_mismatch', `Line ${f.rowRef} ID ${id} does not fit ${formatKey}`, {
      format: formatKey,
      value: id,
    })
  }
  const value = { format: formatKey, value: checked.value }
  return {
    rowKey: `id:${value.value}`,
    id: value,
    siteAddress,
    ownerName,
    mailingAddress,
    rowRef: f.rowRef,
    failure: null,
  }
}

export function prepareCamaRows(
  features: SourceFeature[],
  formatKey: string,
  formats: Map<string, IdFormat>,
): PreparedCamaRow[] {
  const format = formats.get(formatKey)
  if (format === undefined) {
    throw new AppError(ErrorIds.CFG_SCHEMA_FAIL, 'Mapping names an unknown id format', {
      format: formatKey,
    })
  }
  return features.map((f) => prepareOne(f, formatKey, format))
}
