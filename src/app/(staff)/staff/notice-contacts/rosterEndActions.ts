'use server'

import {
  type EndableKind,
  type EndRosterError,
  endRosterEntry,
  type UndoRosterEndError,
  undoRosterEnd,
} from '@/features/rosters/rosterEnd'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { endRosterEntryForm, UNDO_ROSTER_END_FORM } from './noticeForms'

const ENDED: Record<EndableKind, string> = {
  association: 'Condo association ended.',
  park: 'Park ended.',
}

const COPY: Record<UndoRosterEndError | EndRosterError, string> = {
  already_ended: 'This entry has already been ended. Reload the page to see its ending.',
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  not_ended: 'This entry has not been ended.',
  ending_used: 'A list issued after the ending already left this entry off, so it stays ended.',
  replaced: 'A newer entry is on file for this parcel, so this one stays ended.',
  before_list_date: 'The end date cannot be before the date the list is current.',
}

export async function endRosterEntryAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    endRosterEntryForm,
    async ({ db, actor, signal }, input) => {
      const result = await endRosterEntry(db, actor, input, signal)
      if (result.ok) return { ok: true, message: ENDED[input.kind] }
      return result.error === 'before_list_date'
        ? refuseField('endedOn', COPY[result.error])
        : { ok: false, error: COPY[result.error] }
    },
  )
}

export async function undoRosterEndAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    UNDO_ROSTER_END_FORM,
    async ({ db, actor, signal }, input) => {
      const result = await undoRosterEnd(db, actor, input, signal)
      return result.ok
        ? { ok: true, message: 'The ending was undone.' }
        : { ok: false, error: COPY[result.error] }
    },
  )
}
