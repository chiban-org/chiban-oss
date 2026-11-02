'use server'

import { BoardSchema } from '@packs/nh/schema'
import { certificationInput, completenessVoteInput } from '@/app/(staff)/staff/boards/parse'
import { applicantParcelIds, setApplicantParcels } from '@/features/abutters/applicantParcels'
import { terminateForUnpaidNoticeCosts } from '@/features/abutters/noticeCosts'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { errorOrOk } from '@/features/boards/actionResult'
import { recordSelectmenCertification } from '@/features/boards/certification'
import { recordDesDetermination } from '@/features/boards/des500'
import { boardErrorCopy } from '@/features/boards/errorCopy'
import { recordFinalApproval } from '@/features/boards/exercise'
import { cancelMeeting, scheduleMeeting } from '@/features/boards/meetings'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import type { CivilDate } from '@/types/civilDate'

const INVALID: ActionResult = { ok: false, error: 'Check the form fields and try again.' }
const DATE = /^\d{4}-\d{2}-\d{2}$/

function date(formData: FormData, key: string): CivilDate | null {
  const value = text(formData, key)
  return DATE.test(value) ? (value as CivilDate) : null
}

export async function scheduleMeetingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const board = BoardSchema.safeParse(text(formData, 'board'))
    const meetingDate = date(formData, 'meetingDate')
    const kind = text(formData, 'kind') === 'special' ? 'special' : 'regular'
    if (!board.success || meetingDate === null) return INVALID
    const made = await scheduleMeeting(
      db,
      actor,
      { board: board.data, meetingDate, kind, location: text(formData, 'location') },
      signal,
    )
    return errorOrOk(made, 'Meeting added to the calendar.')
  })
}

export async function cancelMeetingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const cancelled = await cancelMeeting(
      db,
      actor,
      { meetingId: text(formData, 'meetingId'), reason: text(formData, 'reason') },
      signal,
    )
    return errorOrOk(
      cancelled,
      'Meeting cancelled. Deadlines that depend on the calendar were recalculated.',
    )
  })
}

export async function setAcceptanceMeetingAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const set = await setAcceptanceMeeting(
      db,
      actor,
      { applicationId: text(formData, 'applicationId'), meetingId: text(formData, 'meetingId') },
      signal,
    )
    return errorOrOk(set, 'Meeting set. The filing deadline for it is shown on the clocks.')
  })
}

export async function completenessVoteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const input = completenessVoteInput(formData)
    if (input === null) return INVALID
    return errorOrOk(await recordCompletenessVote(db, actor, input, signal), 'Vote recorded.')
  })
}

export async function certificationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const input = certificationInput(formData)
    if (input === null) return INVALID
    return errorOrOk(await recordSelectmenCertification(db, actor, input, signal), 'Recorded.')
  })
}

export async function boardRegionalImpactAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const determination = text(formData, 'determination')
    if (!['yes', 'no', 'previously_determined'].includes(determination)) return INVALID
    const previous = text(formData, 'previousBoardRef')
    const recorded = await recordBoardRegionalImpact(
      db,
      actor,
      {
        applicationId: text(formData, 'applicationId'),
        determination: determination as 'yes' | 'no' | 'previously_determined',
        municipalityKeys: formData.getAll('municipalityKeys').map(String),
        ...(previous === '' ? {} : { previousBoardRef: previous }),
      },
      signal,
    )
    return errorOrOk(recorded, 'Regional impact determination recorded.')
  })
}

export async function desDeterminationAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const determination = text(formData, 'determination')
    if (!['within_500ft', 'not_within', 'not_applicable'].includes(determination)) return INVALID
    const recorded = await recordDesDetermination(
      db,
      actor,
      {
        applicationId: text(formData, 'applicationId'),
        determination: determination as 'within_500ft' | 'not_within' | 'not_applicable',
        reason: text(formData, 'reason'),
      },
      signal,
    )
    return errorOrOk(recorded, 'Determination recorded.')
  })
}

export async function finalApprovalAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const finalOn = date(formData, 'finalOn')
    if (finalOn === null) return INVALID
    const recorded = await db.transaction((tx) =>
      recordFinalApproval(
        tx,
        actor,
        { applicationId: text(formData, 'applicationId'), finalOn },
        signal,
      ),
    )
    return errorOrOk(
      recorded,
      'Final approval recorded. The deadline to exercise it is on the clocks.',
    )
  })
}

export async function terminateUnpaidAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const ended = await terminateForUnpaidNoticeCosts(
      db,
      actor,
      { applicationId: text(formData, 'applicationId'), reason: text(formData, 'reason') },
      signal,
    )
    return errorOrOk(ended, 'The application was ended for unpaid notice costs.')
  })
}

export async function addApplicantParcelAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = text(formData, 'applicationId')
    const found = await resolveParcelId(db, { value: text(formData, 'parcelRef') }, signal)
    if (!found.ok) return { ok: false, error: boardErrorCopy('unknown_parcel') }
    const existing = await applicantParcelIds(db, applicationId, signal)
    return errorOrOk(
      await setApplicantParcels(
        db,
        actor,
        { applicationId, parcelIds: [...existing, found.value.parcelId] },
        signal,
      ),
      'Parcels for this application updated.',
    )
  })
}
