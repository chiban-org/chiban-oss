import { z } from 'zod'
import { TOWN_SECTION_KINDS } from '@/db/schema'
import { REF_MAX, townValue } from '@/features/enforcement/sections/suggestions'
import { choice, optionalText, recordId, requiredText } from '@/features/input/schemas'

const SEPARATOR_CHARS = 2
const TOGETHER_MAX = REF_MAX - SEPARATOR_CHARS
const TOO_LONG = `Shorten the section and short title to ${String(TOGETHER_MAX)} characters together.`

const SECTION_FIELDS = {
  provisionKind: choice('what kind of rule it is', TOWN_SECTION_KINDS),
  reference: requiredText('the section', { max: REF_MAX }),
  title: optionalText('a short title', { max: TOGETHER_MAX }),
}

function fitsAFinding(
  value: { reference: string; title: string | null },
  ctx: z.RefinementCtx,
): void {
  if (townValue({ reference: value.reference, title: value.title ?? '' }).length <= REF_MAX) return
  ctx.addIssue({ code: 'custom', path: ['title'], message: TOO_LONG })
}

export const ADD_SECTION_FORM = z.object(SECTION_FIELDS).superRefine(fitsAFinding)

export const EDIT_SECTION_FORM = z
  .object({ ...SECTION_FIELDS, sectionId: recordId('a section') })
  .superRefine(fitsAFinding)

export const RETIRE_SECTION_FORM = z.object({ sectionId: recordId('a section') })
