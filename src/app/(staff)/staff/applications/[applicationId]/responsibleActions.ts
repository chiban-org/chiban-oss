'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { setResponsibleStaff } from '@/features/applications/responsibleStaff'
import { optionalRecordId } from '@/features/input/optionalRecordId'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { applicationIdField } from './actionInput'

const NOT_STAFF =
  'Choose an active town staff member. Reviewers and applicants cannot be responsible.'

const staffMember = optionalRecordId(NOT_STAFF)

const RESPONSIBLE_FORM = z.object({ applicationId: applicationIdField(), userId: staffMember })

export async function setResponsibleStaffAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RESPONSIBLE_FORM, async ({ db, actor, signal }, input) => {
    const result = await setResponsibleStaff(db, actor, input, signal)
    if (!result.ok) {
      return result.error === 'not_staff'
        ? refuseField('userId', NOT_STAFF)
        : { ok: false, error: errorCopy(result.error) }
    }
    revalidatePath('/staff/applications')
    return { ok: true, message: 'Responsible staff member saved.' }
  })
}
