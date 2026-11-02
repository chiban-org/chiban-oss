import { civilDateSchema } from '@packs/nh/schema'
import { z } from 'zod'

export const uuid = z.string().uuid()
export const date = civilDateSchema
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional())
export const manyUuids = z
  .string()
  .min(1)
  .transform((s) => s.split(',').filter((x) => x !== ''))
  .pipe(z.array(z.string().uuid()).min(1))
