import { z } from 'zod'
import { civilDateSchema } from './rules'

export const CodeEditionEntrySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(['verified', 'unverified']),
  effectiveFrom: civilDateSchema,
  enforcementFrom: civilDateSchema.nullable(),
  components: z.array(z.object({ code: z.string().min(1), edition: z.string().min(1) })),
  amendmentPackages: z.array(
    z.object({ effectiveFrom: civilDateSchema, label: z.string().min(1) }),
  ),
  electionWindow: z
    .object({ until: civilDateSchema, mayElect: z.array(z.string().min(1)).min(1) })
    .nullable(),
  citation: z.object({ label: z.string().min(1), url: z.string().url() }),
})
export type CodeEditionEntry = z.infer<typeof CodeEditionEntrySchema>

export const RecordEventKindSchema = z.enum([
  'application_withdrawn',
  'application_denied',
  'building_removed',
  'registration_expired',
  'septic_replaced_or_removed',
  'appeal_period_expired',
])
export type RecordEventKind = z.infer<typeof RecordEventKindSchema>

export const RetentionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('permanent') }),
  z.object({ kind: z.literal('duration'), years: z.number().int().positive() }),
  z.object({
    kind: z.literal('event'),
    events: z.array(RecordEventKindSchema).min(1),
    plusYears: z.number().int().min(0),
  }),
])
export type Retention = z.infer<typeof RetentionSchema>

export const RecordSeriesSchema = z.object({
  key: z.string().min(1),
  version: z.number().int().positive(),
  label: z.string().min(1),
  citation: z.object({ label: z.string().min(1), url: z.string().url() }),
  retention: RetentionSchema,
  preservation: z.enum(['pdfa', 'original']),
  outcomes: z
    .object({
      withdrawn: z.string().min(1).optional(),
      denied: z.string().min(1).optional(),
      expired: z.string().min(1).optional(),
    })
    .optional(),
})
export type RecordSeries = z.infer<typeof RecordSeriesSchema>
