'use server'

import {
  publishCase,
  setComplaintPublicText,
  unpublishCase,
} from '@/features/enforcement/publicText'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { COMPLAINT_PUBLIC_TEXT_FORM, PUBLISH_CASE_FORM, UNPUBLISH_CASE_FORM } from './caseForms'
import { settled } from './enforcementResult'

export async function complaintPublicTextAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    COMPLAINT_PUBLIC_TEXT_FORM,
    async ({ db, actor, signal }, input) =>
      settled(await setComplaintPublicText(db, actor, input, signal), 'Public text saved.'),
  )
}

export async function publishCaseAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, PUBLISH_CASE_FORM, async ({ db, actor, signal }, input) =>
    settled(await publishCase(db, actor, input, signal), 'The case is now shown on the public site.'),
  )
}

export async function unpublishCaseAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, UNPUBLISH_CASE_FORM, async ({ db, actor, signal }, input) =>
    settled(await unpublishCase(db, actor, input, signal), 'The case is hidden from the public site.'),
  )
}
