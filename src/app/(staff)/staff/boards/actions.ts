'use server'

import { addApplicantParcel } from '@/features/abutters/applicantParcels'
import { terminateForUnpaidNoticeCosts } from '@/features/abutters/noticeCosts'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { recordSelectmenCertification } from '@/features/boards/certification'
import { recordDesDetermination } from '@/features/boards/des500'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { recordFinalApproval } from '@/features/boards/exercise'
import {
  cancelMeeting,
  isAlreadyScheduledByActor,
  scheduleMeeting,
} from '@/features/boards/meetings'
import { tellPacketRecipientsCancelled } from '@/features/boards/packetCancel'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { getMailTransport } from '@/features/mail/transport'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { errorOrField } from './formFields'
import {
  ACCEPTANCE_MEETING_FORM,
  APPLICANT_PARCEL_FORM,
  CANCEL_MEETING_FORM,
  CERTIFICATION_FORM,
  COMPLETENESS_VOTE_FORM,
  DES_FORM,
  FINAL_APPROVAL_FORM,
  REGIONAL_IMPACT_FORM,
  SCHEDULE_MEETING_FORM,
  TERMINATE_UNPAID_FORM,
} from './forms'

const CANCELLED_MESSAGE =
  'Meeting cancelled. Deadlines that depend on the calendar were recalculated.'

export async function scheduleMeetingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    SCHEDULE_MEETING_FORM,
    async ({ db, actor, signal }, input) => {
      const { startsAt, ...rest } = input
      const details = { ...rest, location: input.location ?? '', startsAtMinute: startsAt }
      const made = await scheduleMeeting(db, actor, details, signal)
      if (
        !made.ok &&
        made.error === 'already_scheduled' &&
        (await isAlreadyScheduledByActor(db, actor, details, signal))
      ) {
        return { ok: true, message: boardErrorCopy('already_scheduled') }
      }
      return errorOrField(made, 'Meeting added to the calendar.', {
        already_scheduled: 'meetingDate',
      })
    },
  )
}

export async function cancelMeetingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CANCEL_MEETING_FORM, async ({ db, actor, signal }, input) => {
    const cancelled = await cancelMeeting(db, actor, input, signal)
    if (!cancelled.ok) return errorOrField(cancelled, '', { reason_required: 'reason' })
    if (!input.tellRecipients) return { ok: true, message: CANCELLED_MESSAGE }
    const told = await tellPacketRecipientsCancelled(
      db,
      getMailTransport(),
      actor,
      { meetingId: input.meetingId },
      signal,
    )
    return told.ok
      ? {
          ok: true,
          message: `${CANCELLED_MESSAGE} ${told.value.told} packet recipients were told.`,
        }
      : { ok: true, message: `${CANCELLED_MESSAGE} The packet recipients could not be emailed.` }
  })
}

export async function setAcceptanceMeetingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    ACCEPTANCE_MEETING_FORM,
    async ({ db, actor, signal }, input) =>
      errorOrField(
        await setAcceptanceMeeting(db, actor, input, signal),
        'Meeting set. The filing deadline for it is shown on the clocks.',
      ),
  )
}

export async function completenessVoteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    COMPLETENESS_VOTE_FORM,
    async ({ db, actor, signal }, input) => {
      const { reason, ...rest } = input
      const voted = await recordCompletenessVote(
        db,
        actor,
        { ...rest, ...(reason === null ? {} : { reason }) },
        signal,
      )
      return errorOrField(voted, 'Vote recorded.', {
        before_meeting: 'votedOn',
        future_date: 'votedOn',
      })
    },
  )
}

export async function certificationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CERTIFICATION_FORM, async ({ db, actor, signal }, input) => {
    const { decidedOn, ...rest } = input
    const recorded = await recordSelectmenCertification(
      db,
      actor,
      { ...rest, ...(decidedOn === null ? {} : { decidedOn }) },
      signal,
    )
    return errorOrField(recorded, 'Recorded.')
  })
}

export async function boardRegionalImpactAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    REGIONAL_IMPACT_FORM,
    async ({ db, actor, signal }, input) => {
      const { previousBoardRef, ...rest } = input
      const recorded = await recordBoardRegionalImpact(
        db,
        actor,
        { ...rest, ...(previousBoardRef === null ? {} : { previousBoardRef }) },
        signal,
      )
      return errorOrField(recorded, 'Regional impact determination recorded.', {
        board_ref_required: 'previousBoardRef',
        municipality_required: 'municipalityKeys',
        unknown_municipality: 'municipalityKeys',
      })
    },
  )
}

export async function desDeterminationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, DES_FORM, async ({ db, actor, signal }, input) => {
    const recorded = await recordDesDetermination(
      db,
      actor,
      { ...input, reason: input.reason ?? '' },
      signal,
    )
    return errorOrField(recorded, 'Determination recorded.', { reason_required: 'reason' })
  })
}

export async function finalApprovalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, FINAL_APPROVAL_FORM, async ({ db, actor, signal }, input) => {
    const recorded = await db.transaction((tx) => recordFinalApproval(tx, actor, input, signal))
    return errorOrField(
      recorded,
      'Final approval recorded. The deadline to exercise it is on the clocks.',
      { future_date: 'finalOn' },
    )
  })
}

export async function terminateUnpaidAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, TERMINATE_UNPAID_FORM, async ({ db, actor, signal }, input) =>
    errorOrField(
      await terminateForUnpaidNoticeCosts(db, actor, input, signal),
      'The application was ended for unpaid notice costs.',
      { reason_required: 'reason' },
    ),
  )
}

export async function addApplicantParcelAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    APPLICANT_PARCEL_FORM,
    async ({ db, actor, signal }, input) => {
      const found = await resolveParcelId(db, { value: input.parcelRef }, signal)
      if (!found.ok) return refuseField('parcelRef', boardErrorCopy('unknown_parcel'))
      return errorOrField(
        await addApplicantParcel(
          db,
          actor,
          { applicationId: input.applicationId, parcelId: found.value.parcelId },
          signal,
        ),
        'Parcels for this application updated.',
      )
    },
  )
}
