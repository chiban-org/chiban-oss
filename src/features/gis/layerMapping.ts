import { z } from 'zod'
import { camaMappingSchema } from '@/features/cama/mapping'
import type { LayerKey } from '@/features/gis/exceptionKinds'

export const idFieldSchema = z.object({
  field: z.string().min(1),
  format: z.string().min(1),
  padNumeric: z.boolean().default(false),
})

export const layerMappingSchema = z.object({
  primaryId: idFieldSchema,
  extraIds: z.array(idFieldSchema).default([]),
  siteAddress: z.object({ fields: z.array(z.string().min(1)).min(1) }).optional(),
  ownerName: z.string().min(1).optional(),
  mailingAddress: z.object({ fields: z.array(z.string().min(1)).min(1) }).optional(),
  sourceKey: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
})

export type IdField = z.infer<typeof idFieldSchema>
export type LayerMapping = z.infer<typeof layerMappingSchema>

export const featureMappingSchema = z.object({
  sourceKey: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
})

export type FeatureMapping = z.infer<typeof featureMappingSchema>

export function mappingSchemaFor(key: LayerKey): z.ZodType {
  if (key === 'parcels') return layerMappingSchema
  if (key === 'cama') return camaMappingSchema
  return featureMappingSchema
}
