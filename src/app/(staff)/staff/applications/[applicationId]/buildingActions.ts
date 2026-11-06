'use server'

import { z } from 'zod'
import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import {
  recordRegionalImpactDetermination,
  recordRegionalImpactNotice,
} from '@/features/building/regionalImpact'
import { renewPermit } from '@/features/building/renewal'
import { renewedMessage } from '@/features/building/renewalText'
import { choice, civilDate, optionalText, requiredText } from '@/features/input/schemas'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import type { CivilDate } from '@/types/civilDate'
import { applicationIdField, outcome } from './actionInput'

const FUTURE_FILING = 'The filing date cannot be in the future.'
const FUTURE_RESOLUTION = 'The resolution date cannot be in the future.'

const APPEAL_FORM = z.object({
  applicationId: applicationIdField(),
  filedOn: civilDate('the filing date'),
  appellantName: requiredText('the appellant name', { max: 200 }),
})

const RESOLVE_FORM = z.object({
  applicationId: applicationIdField(),
  resolvedOn: civilDate('the resolution date'),
  outcome: choice('an outcome', ['permit_upheld', 'permit_revoked'] as const),
})

const renewForm = (today: CivilDate) =>
  z.object({
    applicationId: applicationIdField(),
    renewedOn: civilDate('the renewal date', { latest: today }),
  })

export async function regionalImpactAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    (today) =>
      z.object({
        applicationId: applicationIdField(),
        determination: choice('a determination', ['yes', 'no', 'previously_determined'] as const),
        determinedOn: civilDate('the determination date', { latest: today }),
        previousBoardRef: optionalText('the board reference', { max: 200 }),
      }),
    async ({ db, actor, signal }, input) => {
      const result = await recordRegionalImpactDetermination(
        db,
        actor,
        {
          applicationId: input.applicationId,
          determination: input.determination,
          determinedOn: input.determinedOn,
          ...(input.previousBoardRef === null ? {} : { previousBoardRef: input.previousBoardRef }),
        },
        signal,
      )
      return outcome(result, 'Determination recorded.', { board_ref_required: 'previousBoardRef' })
    },
  )
}

export async function regionalNoticeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    (today) =>
      z.object({
        applicationId: applicationIdField(),
        recipientKind: choice('a recipient', [
          'governing_body',
          'regional_planning_commission',
          'affected_municipality',
        ] as const),
        recipientName: requiredText('the recipient name', { max: 200 }),
        method: choice('a method', ['certified_mail', 'hand_delivery', 'email', 'other'] as const),
        mailedOn: civilDate('the date mailed', { latest: today }),
        reference: optionalText('the reference', { max: 200 }),
      }),
    async ({ db, actor, signal }, input) => {
      const { reference, ...rest } = input
      const result = await recordRegionalImpactNotice(
        db,
        actor,
        { ...rest, ...(reference === null ? {} : { reference }) },
        signal,
      )
      return outcome(result, 'Notice recorded.', { certified_mail_required: 'method' })
    },
  )
}

export async function recordAppealAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, APPEAL_FORM, async ({ db, actor, signal }, input) => {
    const recorded = await recordAppeal(db, actor, input, signal)
    if (!recorded.ok && recorded.error === 'future_date') {
      return refuseField('filedOn', FUTURE_FILING)
    }
    return outcome(recorded, 'Appeal recorded. The permit is suspended.')
  })
}

export async function resolveAppealAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, RESOLVE_FORM, async ({ db, actor, signal }, input) => {
    const resolved = await resolveAppeal(db, actor, input, signal)
    if (!resolved.ok && resolved.error === 'future_date') {
      return refuseField('resolvedOn', FUTURE_RESOLUTION)
    }
    return outcome(resolved, 'Appeal resolved.', { before_filing: 'resolvedOn' })
  })
}

export async function renewAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(formData, renewForm, async ({ db, actor, signal }, input) => {
    const result = await renewPermit(db, actor, input, signal)
    return result.ok
      ? { ok: true, message: renewedMessage(result.value.newDue) }
      : { ok: false, error: errorCopy(result.error) }
  })
}
