'use server'

import { type MeetingEdited, updateMeetingDetails } from '@/features/boards/meetingEdit'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { errorOrField } from '../../formFields'
import { EDIT_MEETING_FORM } from '../../forms'

const PAST = 'That meeting has already taken place, so its time and place cannot be changed.'

function updatedMessage(edited: MeetingEdited): string {
  const agenda = edited.agendaReopened
    ? ' The agenda went back to draft. Show it on the public site again so it lists the new time.'
    : ''
  const notices =
    edited.hearings === 0
      ? ''
      : ` Notices already sent for the ${edited.hearings === 1 ? 'hearing' : `${edited.hearings} hearings`} at this meeting still show the old time. Send corrected notices.`
  return `Meeting updated.${agenda}${notices}`
}

export async function updateMeetingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, EDIT_MEETING_FORM, async ({ db, actor, signal }, input) => {
    const edited = await updateMeetingDetails(
      db,
      actor,
      {
        meetingId: input.meetingId,
        startsAtMinute: input.startsAt,
        location: input.location ?? '',
      },
      signal,
    )
    if (!edited.ok && edited.error === 'meeting_past') return { ok: false, error: PAST }
    return edited.ok
      ? { ok: true, message: updatedMessage(edited.value) }
      : errorOrField(edited, '')
  })
}
