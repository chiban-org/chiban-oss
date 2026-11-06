'use server'

import {
  ENDABLE_KINDS,
  type EndableKind,
  endRosterEntry,
  type UndoRosterEndError,
  undoRosterEnd,
} from '@/features/rosters/rosterEnd'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { dateOf, INVALID, recordIdOf } from './rosterFields'

const ENDED: Record<EndableKind, string> = {
  association: 'Condo association ended.',
  park: 'Park ended.',
}

const COPY: Record<UndoRosterEndError, string> = {
  forbidden: errorCopy('forbidden'),
  not_found: errorCopy('not_found'),
  not_ended: 'This entry has not been ended.',
  ending_used: 'A list issued after the ending already left this entry off, so it stays ended.',
  replaced: 'A newer entry is on file for this parcel, so this one stays ended.',
}

function kindOf(formData: FormData): EndableKind | null {
  const kind = text(formData, 'kind')
  return ENDABLE_KINDS.find((k) => k === kind) ?? null
}

export async function endRosterEntryAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = kindOf(formData)
    const entryId = recordIdOf(formData, 'entryId')
    const endedOn = dateOf(formData, 'endedOn')
    if (kind === null || entryId === null || endedOn === null) return INVALID
    const result = await endRosterEntry(db, actor, { kind, entryId, endedOn }, signal)
    return result.ok ? { ok: true, message: ENDED[kind] } : { ok: false, error: COPY[result.error] }
  })
}

export async function undoRosterEndAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = kindOf(formData)
    const entryId = recordIdOf(formData, 'entryId')
    if (kind === null || entryId === null) return INVALID
    const result = await undoRosterEnd(db, actor, { kind, entryId }, signal)
    return result.ok
      ? { ok: true, message: 'The ending was undone.' }
      : { ok: false, error: COPY[result.error] }
  })
}
