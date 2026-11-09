'use server'

import { z } from 'zod'
import { recordId, wholeNumber } from '@/features/input/schemas'
import { type Ending, endApplication } from '@/features/portal/endApplication'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { parseForm } from '@/server/formInput'
import { withPortalActor } from '@/server/portalAction'

const MAX_ROW_VERSION = 2_147_483_647

const EndForm = z.object({
  applicationId: recordId('an application'),
  expectedRowVersion: wholeNumber('the version of the application', {
    min: 1,
    max: MAX_ROW_VERSION,
  }),
})

const DONE: Record<Ending, string> = {
  withdraw: 'Application withdrawn.',
  delete_draft: 'Draft deleted.',
}

const fail = (error: string): ActionResult => ({ ok: false, error })

async function end(formData: FormData, ending: Ending): Promise<ActionResult> {
  return await withPortalActor(formData, fail, async ({ db, actor, signal }) => {
    const parsed = parseForm(EndForm, formData)
    if (!parsed.ok) return parsed.error
    const result = await endApplication(db, actor, { ...parsed.value, ending }, signal)
    if (result.ok) return { ok: true, message: DONE[ending] }
    return fail(
      typeof result.error === 'string' ? errorCopy(result.error) : errorCopy('invalid_transition'),
    )
  })
}

export async function withdrawApplicationAction(formData: FormData): Promise<ActionResult> {
  return await end(formData, 'withdraw')
}

export async function deleteDraftAction(formData: FormData): Promise<ActionResult> {
  return await end(formData, 'delete_draft')
}
