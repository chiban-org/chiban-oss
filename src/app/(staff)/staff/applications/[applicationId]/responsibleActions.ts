'use server'

import { revalidatePath } from 'next/cache'
import {
  type ResponsibleStaffError,
  setResponsibleStaff,
} from '@/features/applications/responsibleStaff'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { isUuid } from '@/utils/uuid'

const COPY: Record<ResponsibleStaffError, string> = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  not_staff: 'Choose an active town staff member. Reviewers and applicants cannot be responsible.',
}

export async function setResponsibleStaffAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = text(formData, 'applicationId')
    const chosen = text(formData, 'userId')
    if (!isUuid(applicationId) || (chosen !== '' && !isUuid(chosen))) {
      return { ok: false, error: errorCopy('invalid_input') }
    }
    const userId = chosen === '' ? null : chosen
    const result = await setResponsibleStaff(db, actor, { applicationId, userId }, signal)
    if (!result.ok) return { ok: false, error: COPY[result.error] }
    revalidatePath('/staff/applications')
    return { ok: true, message: 'Responsible staff member saved.' }
  })
}
