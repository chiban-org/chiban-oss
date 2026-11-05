'use server'

import { errorOrOk } from '@/features/boards/actionResult'
import { confirmEntry, ENTRY_KINDS } from '@/features/rosters/confirm'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import { INVALID, recordIdOf } from './rosterFields'

export async function confirmEntryAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = ENTRY_KINDS.find((k) => k === text(formData, 'kind'))
    const entryId = recordIdOf(formData, 'entryId')
    if (kind === undefined || entryId === null) return INVALID
    return errorOrOk(
      await confirmEntry(db, actor, { kind, entryId }, signal),
      'Marked as still correct today.',
    )
  })
}
