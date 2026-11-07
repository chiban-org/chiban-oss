'use server'

import {
  addAgendaItem,
  buildAgenda,
  moveAgendaItem,
  publishAgenda,
  removeAgendaItem,
  reopenAgenda,
} from '@/features/agendas/agendas'
import { continueHearing } from '@/features/hearings/continuations'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { recordProof } from '@/features/notices/proofs'
import { routeToTrc } from '@/features/reviews/trcRouting'
import { getObjectStore } from '@/features/storage/objectStore'
import type { ActionResult } from '@/server/actionRunner'
import { runStaffForm } from '@/server/formInput'
import { errorOrField } from '../formFields'
import {
  ADD_AGENDA_ITEM_FORM,
  CONTINUE_HEARING_FORM,
  HEARING_ONLY_FORM,
  MARK_HELD_FORM,
  MEETING_ONLY_FORM,
  MOVE_AGENDA_ITEM_FORM,
  RECORD_PROOF_FORM,
  REMOVE_AGENDA_ITEM_FORM,
  ROUTE_TO_TRC_FORM,
  SCHEDULE_HEARING_FORM,
} from './forms'

export async function scheduleHearingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, SCHEDULE_HEARING_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await scheduleHearing(db, actor, input, signal),
      'Hearing scheduled. The notice checklist is ready.',
    ),
  )
}

export async function recordProofAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RECORD_PROOF_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(await recordProof(db, actor, input, signal), 'Proof recorded.', {
      item_not_found: 'itemIds',
      reference_required: 'reference',
      future_date: 'effectiveOn',
      document_not_found: 'documentId',
      wrong_document: 'documentId',
    }),
  )
}

export async function markProperlyNoticedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, HEARING_ONLY_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await markProperlyNoticed(db, actor, input.hearingId, signal),
      'Marked properly noticed.',
    ),
  )
}

export async function continueHearingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    CONTINUE_HEARING_FORM,
    async ({ db, actor, signal }, input) => {
      const announced = input.announced === 'yes'
      const continued = await continueHearing(
        db,
        actor,
        {
          hearingId: input.hearingId,
          toMeetingId: input.toMeetingId,
          announcedAtMeeting: announced,
          announcedDetails: input.details ?? '',
        },
        signal,
      )
      return errorOrField(
        continued,
        announced
          ? 'Hearing continued. The notice already given carries forward.'
          : 'Hearing continued. New notice is required for the new date.',
        { details_required: 'details' },
      )
    },
  )
}

export async function markHeldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, MARK_HELD_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(await markHearingHeld(db, actor, input, signal), 'Hearing marked as held.', {
      future_date: 'heldOn',
      before_meeting: 'heldOn',
    }),
  )
}

export async function buildAgendaAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, MEETING_ONLY_FORM, async ({ db, actor, signal }, input) => {
    const built = await buildAgenda(db, actor, input.meetingId, signal)
    if (built.ok && built.value.onMeeting === 0) {
      return {
        ok: true,
        message:
          'No hearings are scheduled for this meeting. A continued hearing is listed at the meeting it was continued to.',
      }
    }
    if (built.ok && built.value.added === 0) {
      return { ok: true, message: 'No new hearings to add. The agenda already lists them.' }
    }
    return errorOrField(
      built,
      built.ok && built.value.added === 1
        ? 'Added 1 hearing to the agenda.'
        : `Added ${built.ok ? built.value.added : 0} hearings to the agenda.`,
    )
  })
}

export async function addAgendaItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ADD_AGENDA_ITEM_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await addAgendaItem(db, actor, { ...input, description: input.description ?? '' }, signal),
      'Item added to the agenda.',
    ),
  )
}

export async function moveAgendaItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, MOVE_AGENDA_ITEM_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(await moveAgendaItem(db, actor, input, signal), 'Item moved.'),
  )
}

export async function removeAgendaItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    REMOVE_AGENDA_ITEM_FORM,
    async ({ db, actor, signal }, input) =>
      errorOrField(await removeAgendaItem(db, actor, input.itemId, signal), 'Item removed.'),
  )
}

export async function publishAgendaAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, MEETING_ONLY_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await publishAgenda(db, getObjectStore(), actor, input.meetingId, signal),
      'Agenda shown on the public site.',
    ),
  )
}

export async function reopenAgendaAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, MEETING_ONLY_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await reopenAgenda(db, actor, input.meetingId, signal),
      'Agenda taken off the board and meetings pages and reopened. Showing it again creates a new revision.',
    ),
  )
}

export async function routeToTrcAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, ROUTE_TO_TRC_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await routeToTrc(
        db,
        actor,
        {
          applicationId: input.applicationId,
          ...(input.meetingId === null ? {} : { meetingId: input.meetingId }),
        },
        signal,
      ),
      'Sent to the Technical Review Committee departments.',
    ),
  )
}
