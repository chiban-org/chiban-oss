import { z } from 'zod'

export const CAMA_ADAPTER_STATUS = 'stubbed' as const

export const CAMA_STUB_NOTICE =
  "The Avitar export layout has not been checked against a real Avitar file. The columns below are the Chiban CSV layout. Match your own file's columns with the pickers before you run an import."

export const CAMA_ENCODINGS = ['auto', 'utf-8', 'windows-1252'] as const
export const CAMA_DELIMITERS = [',', '\t', '|'] as const

const MAX_PART_WIDTH = 15

const idPartSchema = z.union([
  z.object({
    column: z.string().min(1),
    width: z.number().int().min(1).max(MAX_PART_WIDTH),
  }),
  z.object({ literal: z.string().regex(/^\d+$/) }),
])

export const camaMappingSchema = z.object({
  encoding: z.enum(CAMA_ENCODINGS),
  delimiter: z.enum(CAMA_DELIMITERS),
  id: z.object({
    format: z.string().min(1),
    parts: z.array(idPartSchema).min(1),
  }),
  ownerName: z.object({
    columns: z.array(z.string().min(1)).min(1),
    joiner: z.string(),
  }),
  mailingAddress: z.object({ columns: z.array(z.string().min(1)).min(1) }),
  siteAddress: z.object({ columns: z.array(z.string().min(1)).min(1) }).optional(),
})

export type CamaMapping = z.infer<typeof camaMappingSchema>
export type CamaIdPart = CamaMapping['id']['parts'][number]

export const DEFAULT_CAMA_COLUMNS = [
  'map',
  'lot',
  'sub',
  'unit',
  'owner_1',
  'owner_2',
  'mail_street_1',
  'mail_street_2',
  'mail_city',
  'mail_state',
  'mail_zip',
  'site_number',
  'site_street',
] as const

export const DEFAULT_CAMA_MAPPING: CamaMapping = {
  encoding: 'auto',
  delimiter: ',',
  id: {
    format: 'cama15',
    parts: [
      { column: 'map', width: 3 },
      { column: 'lot', width: 3 },
      { column: 'sub', width: 3 },
      { literal: '000' },
      { column: 'unit', width: 3 },
    ],
  },
  ownerName: { columns: ['owner_1', 'owner_2'], joiner: ' & ' },
  mailingAddress: {
    columns: ['mail_street_1', 'mail_street_2', 'mail_city', 'mail_state', 'mail_zip'],
  },
  siteAddress: { columns: ['site_number', 'site_street'] },
}

export function mappedColumns(mapping: CamaMapping): string[] {
  const idColumns = mapping.id.parts.flatMap((p) => ('column' in p ? [p.column] : []))
  const all = [
    ...idColumns,
    ...mapping.ownerName.columns,
    ...mapping.mailingAddress.columns,
    ...(mapping.siteAddress?.columns ?? []),
  ]
  return [...new Set(all)]
}
