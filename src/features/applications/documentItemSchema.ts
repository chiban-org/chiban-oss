import { z } from 'zod'
import { ConditionSchema } from '@/features/forms/condition'

export const DOCUMENT_STAGES = ['to_file', 'before_decision', 'before_issue', 'before_co'] as const
export type DocumentStage = (typeof DOCUMENT_STAGES)[number]

const DOCUMENT_STAGE_LABELS: ReadonlyMap<DocumentStage, string> = new Map([
  ['to_file', 'To file'],
  ['before_decision', 'Before the decision'],
  ['before_issue', 'Before the permit is issued'],
  ['before_co', 'Before the certificate of occupancy'],
])

export function documentStageLabel(stage: DocumentStage): string {
  return DOCUMENT_STAGE_LABELS.get(stage) ?? stage
}

export const ITEM_KEY_MAX = 100

export const DocumentItemSchema = z.object({
  key: z
    .string()
    .max(ITEM_KEY_MAX)
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lower-case letters, digits and underscores.'),
  label: z.string().trim().min(1),
  help: z.string().optional(),
  stage: z.enum(DOCUMENT_STAGES),
  requiredIf: ConditionSchema.optional(),
  optional: z.boolean().optional(),
  waivable: z.boolean(),
  stateOrFederalPermit: z.boolean().optional(),
})
export type DocumentItem = z.infer<typeof DocumentItemSchema>

export function documentItemsOf(body: { documents?: DocumentItem[] | undefined }): DocumentItem[] {
  return body.documents ?? []
}
