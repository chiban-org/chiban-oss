'use server'

import { revalidatePath } from 'next/cache'
import { type ReassignError, reassignCase } from '@/features/enforcement/caseAssignment'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { isUuid } from '@/utils/uuid'

const COPY: Record<ReassignError, string> = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  not_eligible: 'Choose someone whose role works code enforcement cases.',
}

export async function reassignCaseAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const caseId = text(formData, 'caseId')
    const chosen = text(formData, 'userId')
    if (!isUuid(caseId) || (chosen !== '' && !isUuid(chosen))) {
      return { ok: false, error: errorCopy('invalid_input') }
    }
    const userId = chosen === '' ? null : chosen
    const result = await reassignCase(db, actor, { caseId, userId }, signal)
    if (!result.ok) return { ok: false, error: COPY[result.error] }
    revalidatePath('/staff/enforcement')
    return { ok: true, message: 'Case reassigned.' }
  })
}
