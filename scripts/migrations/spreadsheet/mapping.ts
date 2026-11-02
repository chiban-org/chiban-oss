import { z } from 'zod'
import { camaMappingSchema } from '@/features/cama/mapping'

export const DATE_FORMATS = ['excel_serial', 'YYYY-MM-DD', 'MM/DD/YYYY', 'M/D/YY'] as const

export type DateFormat = (typeof DATE_FORMATS)[number]

const columnName = z.string().min(1)

export const spreadsheetMappingSchema = z.object({
  sheet: z.string().min(1).optional(),
  headerRow: z.number().int().min(1),
  recordType: z.union([z.object({ column: columnName }), z.object({ literal: columnName })]),
  number: columnName.optional(),
  parcel: z.object({
    format: z.string().min(1),
    parts: camaMappingSchema.shape.id.shape.parts,
  }),
  date: z
    .object({
      column: columnName,
      formats: z.array(z.enum(DATE_FORMATS)).min(1),
      twoDigitYearPivot: z.number().int().min(0).max(99),
    })
    .optional(),
  description: z.array(columnName).optional(),
  keep: z.array(columnName),
})

export type SpreadsheetMapping = z.infer<typeof spreadsheetMappingSchema>

export function mappedSheetColumns(mapping: SpreadsheetMapping): string[] {
  const parcelColumns = mapping.parcel.parts.flatMap((p) => ('column' in p ? [p.column] : []))
  const all = [
    ...('column' in mapping.recordType ? [mapping.recordType.column] : []),
    ...(mapping.number === undefined ? [] : [mapping.number]),
    ...parcelColumns,
    ...(mapping.date === undefined ? [] : [mapping.date.column]),
    ...(mapping.description ?? []),
    ...mapping.keep,
  ]
  return [...new Set(all)]
}
