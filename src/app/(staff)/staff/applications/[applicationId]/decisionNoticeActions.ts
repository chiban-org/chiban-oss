'use server'

import { z } from 'zod'
import { recordDecisionNotice } from '@/features/applications/deemedRefusal'
import { civilDate, recordId } from '@/features/input/schemas'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { applicationIdField } from './actionInput'

const DECISION_NOTICE_FORM = z.object({
  applicationId: applicationIdField(),
  documentId: recordId('the notice document'),
  mailedOn: civilDate('the date mailed'),
})

const REFUSALS: Readonly<Record<string, string>> = {
  already_recorded: 'A written decision notice is already recorded for this application.',
  document_not_found: 'Choose a document filed on this application.',
  not_found: 'This application is no longer on the list. Reload the page.',
}

export async function recordDecisionNoticeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    DECISION_NOTICE_FORM,
    async ({ db, actor, signal }, input) => {
      const result = await recordDecisionNotice(db, actor, input, signal)
      if (result.ok) return { ok: true, message: 'Written decision notice recorded.' }
      if (result.error === 'future_date') {
        return refuseField('mailedOn', 'Enter a date that is today or earlier.')
      }
      return { ok: false, error: REFUSALS[result.error] ?? errorCopy(result.error) }
    },
  )
}
