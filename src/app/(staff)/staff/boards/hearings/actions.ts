'use server'

import {
  addAgendaItem,
  buildAgenda,
  moveAgendaItem,
  publishAgenda,
  removeAgendaItem,
  reopenAgenda,
} from '@/features/agendas/agendas'
import { createMeetingPacket } from '@/features/agendas/meetingPacket'
import { errorOrOk } from '@/features/boards/actionResult'
import { continueHearing } from '@/features/hearings/continuations'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { PROOF_METHODS, type ProofMethod } from '@/features/notices/proofMethods'
import { recordProof } from '@/features/notices/proofs'
import { routeToTrc } from '@/features/reviews/trcRouting'
import { getObjectStore } from '@/features/storage/objectStore'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import { type CivilDate, parseCivilDate } from '@/types/civilDate'

const INVALID: ActionResult = { ok: false, error: 'Check the form fields and try again.' }
const KINDS = ['submission_and_hearing', 'public_hearing', 'rehearing'] as const
const AGENDA_KINDS = ['hearing', 'business', 'minutes_approval', 'other'] as const

export function dateOf(formData: FormData, key: string): CivilDate | null {
  const parsed = parseCivilDate(text(formData, key))
  return parsed.ok ? parsed.value : null
}

export async function scheduleHearingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = KINDS.find((k) => k === text(formData, 'kind'))
    if (kind === undefined) return INVALID
    const made = await scheduleHearing(
      db,
      actor,
      {
        applicationId: text(formData, 'applicationId'),
        meetingId: text(formData, 'meetingId'),
        kind,
      },
      signal,
    )
    return errorOrOk(made, 'Hearing scheduled. The notice checklist is ready.')
  })
}

export async function recordProofAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const method = PROOF_METHODS.find((m): m is ProofMethod => m === text(formData, 'method'))
    const effectiveOn = dateOf(formData, 'effectiveOn')
    const itemIds = formData.getAll('itemIds').filter((v): v is string => typeof v === 'string')
    if (method === undefined || effectiveOn === null) return INVALID
    const reference = text(formData, 'reference')
    const recorded = await recordProof(
      db,
      actor,
      {
        itemIds,
        method,
        reference: reference === '' ? null : reference,
        effectiveOn,
        documentId: text(formData, 'documentId'),
      },
      signal,
    )
    return errorOrOk(recorded, 'Proof recorded.')
  })
}

export async function markProperlyNoticedAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const marked = await markProperlyNoticed(db, actor, text(formData, 'hearingId'), signal)
    return errorOrOk(marked, 'Marked properly noticed.')
  })
}

export async function continueHearingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const announced = text(formData, 'announced') === 'yes'
    const continued = await continueHearing(
      db,
      actor,
      {
        hearingId: text(formData, 'hearingId'),
        toMeetingId: text(formData, 'toMeetingId'),
        announcedAtMeeting: announced,
        announcedDetails: text(formData, 'details'),
      },
      signal,
    )
    return errorOrOk(
      continued,
      announced
        ? 'Hearing continued. The notice already given carries forward.'
        : 'Hearing continued. New notice is required for the new date.',
    )
  })
}

export async function markHeldAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const heldOn = dateOf(formData, 'heldOn')
    if (heldOn === null) return INVALID
    const held = await markHearingHeld(
      db,
      actor,
      { hearingId: text(formData, 'hearingId'), heldOn },
      signal,
    )
    return errorOrOk(held, 'Hearing marked as held.')
  })
}

export async function buildAgendaAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const built = await buildAgenda(db, actor, text(formData, 'meetingId'), signal)
    return errorOrOk(built, 'Agenda updated from the scheduled hearings.')
  })
}

export async function addAgendaItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const kind = AGENDA_KINDS.find((k) => k === text(formData, 'kind'))
    if (kind === undefined || text(formData, 'title') === '') return INVALID
    const added = await addAgendaItem(
      db,
      actor,
      {
        meetingId: text(formData, 'meetingId'),
        kind,
        title: text(formData, 'title'),
        description: text(formData, 'description'),
      },
      signal,
    )
    return errorOrOk(added, 'Item added to the agenda.')
  })
}

export async function moveAgendaItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const toPosition = Number(text(formData, 'toPosition'))
    if (!Number.isInteger(toPosition)) return INVALID
    const moved = await moveAgendaItem(
      db,
      actor,
      { itemId: text(formData, 'itemId'), toPosition },
      signal,
    )
    return errorOrOk(moved, 'Item moved.')
  })
}

export async function removeAgendaItemAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const removed = await removeAgendaItem(db, actor, text(formData, 'itemId'), signal)
    return errorOrOk(removed, 'Item removed.')
  })
}

export async function publishAgendaAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const published = await publishAgenda(
      db,
      getObjectStore(),
      actor,
      text(formData, 'meetingId'),
      signal,
    )
    return errorOrOk(published, 'Agenda published on the public site.')
  })
}

export async function reopenAgendaAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const reopened = await reopenAgenda(db, actor, text(formData, 'meetingId'), signal)
    return errorOrOk(reopened, 'Agenda reopened. Publishing again creates a new revision.')
  })
}

export async function createMeetingPacketAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const made = await createMeetingPacket(
      db,
      getObjectStore(),
      actor,
      text(formData, 'meetingId'),
      signal,
    )
    return errorOrOk(made, 'Meeting packet created. Send it from Board packets.')
  })
}

export async function routeToTrcAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const meetingId = text(formData, 'meetingId')
    const routed = await routeToTrc(
      db,
      actor,
      {
        applicationId: text(formData, 'applicationId'),
        ...(meetingId === '' ? {} : { meetingId }),
      },
      signal,
    )
    return errorOrOk(routed, 'Sent to the Technical Review Committee departments.')
  })
}
