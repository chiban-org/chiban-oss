'use server'

import { confirmEntry } from '@/features/rosters/confirm'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { CONFIRM_ENTRY_FORM } from './noticeForms'
import { settled } from './rosterResult'

export async function confirmEntryAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CONFIRM_ENTRY_FORM, async ({ db, actor, signal }, input) =>
    settled(await confirmEntry(db, actor, input, signal), 'Marked as still correct today.'),
  )
}
