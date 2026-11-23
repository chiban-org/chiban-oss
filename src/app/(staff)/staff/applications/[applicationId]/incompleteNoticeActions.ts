'use server'

import { z } from 'zod'
import {
  type IncompleteNoticeError,
  sendIncompleteNotice,
} from '@/features/applications/incompleteNotice'
import { requiredText } from '@/features/input/schemas'
import { getObjectStore } from '@/features/storage/objectStore'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { applicationIdField } from './actionInput'

const INCOMPLETE_NOTICE_FORM = z.object({
  applicationId: applicationIdField(),
  reason: requiredText('what is missing from the application', { max: 2000 }),
})

const COPY: Record<IncompleteNoticeError, string> = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  not_submitted: errorCopy('not_submitted'),
  already_complete: errorCopy('already_complete'),
  not_applicable: 'This kind of application does not take an incomplete notice.',
  reason_required: 'Say what is missing from the application.',
}

export async function sendIncompleteNoticeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    INCOMPLETE_NOTICE_FORM,
    async ({ db, actor, signal }, input) => {
      const sent = await sendIncompleteNotice(db, actor, input, {
        store: getObjectStore(),
        signal,
      })
      if (sent.ok) return { ok: true, message: 'Incomplete notice sent.' }
      return sent.error === 'reason_required'
        ? refuseField('reason', COPY.reason_required)
        : { ok: false, error: COPY[sent.error] }
    },
  )
}
