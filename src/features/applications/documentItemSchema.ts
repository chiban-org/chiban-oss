import { z } from 'zod'
import { ConditionSchema } from '@/features/forms/condition'

export const DOCUMENT_STAGES = ['to_file', 'before_decision', 'before_issue', 'before_co'] as const
export type DocumentStage = (typeof DOCUMENT_STAGES)[number]

export const DOCUMENT_STAGE_LABELS: Record<DocumentStage, string> = {
  to_file: 'To file',
  before_decision: 'Before the decision',
  before_issue: 'Before the permit is issued',
  before_co: 'Before the certificate of occupancy',
}

export const DocumentItemSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Use lower-case letters, digits and underscores.'),
  label: z.string().trim().min(1),
  help: z.string().optional(),
  stage: z.enum(DOCUMENT_STAGES),
  requiredIf: ConditionSchema.optional(),
  optional: z.boolean().optional(),
  waivable: z.boolean(),
  stateOrFederalPermit: z.boolean().optional(),
})
export type DocumentItem = z.infer<typeof DocumentItemSchema>

export const STATE_PERMIT_AT_FILING =
  'A Planning Board or ZBA application cannot require a state or federal permit to file. Move this document to before the decision.'

export const DUPLICATE_DOCUMENT_KEY = 'duplicate document key'

const BOARDS_THAT_CANNOT_REQUIRE_PERMITS_TO_FILE: ReadonlySet<string> = new Set([
  'planning_board',
  'zba',
])

export function documentItemIssues(
  items: readonly DocumentItem[],
  boardKind: string | null,
): { index: number; field: 'key' | 'stage'; message: string }[] {
  const out: { index: number; field: 'key' | 'stage'; message: string }[] = []
  const seen = new Set<string>()
  items.forEach((item, index) => {
    if (seen.has(item.key)) out.push({ index, field: 'key', message: DUPLICATE_DOCUMENT_KEY })
    seen.add(item.key)
    const boardFiling =
      boardKind !== null && BOARDS_THAT_CANNOT_REQUIRE_PERMITS_TO_FILE.has(boardKind)
    if (boardFiling && item.stage === 'to_file' && item.stateOrFederalPermit === true) {
      out.push({ index, field: 'stage', message: STATE_PERMIT_AT_FILING })
    }
  })
  return out
}

export function documentItemsOf(body: { documents?: DocumentItem[] | undefined }): DocumentItem[] {
  return body.documents ?? []
}
