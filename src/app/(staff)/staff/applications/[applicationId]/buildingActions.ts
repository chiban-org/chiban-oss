'use server'

import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import {
  recordRegionalImpactDetermination,
  recordRegionalImpactNotice,
} from '@/features/building/regionalImpact'
import { renewPermit } from '@/features/building/renewal'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { dateOf, done, INVALID, INVALID_DATE, idOf } from './actionInput'

export async function regionalImpactAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const determination = text(formData, 'determination')
    const determinedOn = dateOf(formData, 'determinedOn')
    if (applicationId === null || !['yes', 'no', 'previously_determined'].includes(determination))
      return INVALID
    if (determinedOn === null) return INVALID_DATE
    const ref = text(formData, 'previousBoardRef')
    const result = await recordRegionalImpactDetermination(
      db,
      actor,
      {
        applicationId,
        determination: determination as 'yes',
        determinedOn,
        ...(ref === '' ? {} : { previousBoardRef: ref }),
      },
      signal,
    )
    return done(result, 'Determination recorded.')
  })
}

export async function regionalNoticeAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const mailedOn = dateOf(formData, 'mailedOn')
    const recipientKind = text(formData, 'recipientKind')
    const method = text(formData, 'method')
    if (
      applicationId === null ||
      !['governing_body', 'regional_planning_commission', 'affected_municipality'].includes(
        recipientKind,
      ) ||
      !['certified_mail', 'hand_delivery', 'email', 'other'].includes(method)
    ) {
      return INVALID
    }
    if (mailedOn === null) return INVALID_DATE
    const reference = text(formData, 'reference')
    const result = await recordRegionalImpactNotice(
      db,
      actor,
      {
        applicationId,
        recipientKind: recipientKind as 'governing_body',
        recipientName: text(formData, 'recipientName'),
        method: method as 'email',
        mailedOn,
        ...(reference === '' ? {} : { reference }),
      },
      signal,
    )
    return done(result, 'Notice recorded.')
  })
}

export async function recordAppealAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const filedOn = dateOf(formData, 'filedOn')
    if (applicationId === null) return INVALID
    if (filedOn === null) return INVALID_DATE
    return done(
      await recordAppeal(
        db,
        actor,
        { applicationId, filedOn, appellantName: text(formData, 'appellantName') },
        signal,
      ),
      'Appeal recorded. The permit is suspended.',
    )
  })
}

export async function resolveAppealAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const resolvedOn = dateOf(formData, 'resolvedOn')
    const outcome = text(formData, 'outcome')
    if (applicationId === null || (outcome !== 'permit_upheld' && outcome !== 'permit_revoked'))
      return INVALID
    if (resolvedOn === null) return INVALID_DATE
    return done(
      await resolveAppeal(db, actor, { applicationId, resolvedOn, outcome }, signal),
      'Appeal resolved.',
    )
  })
}

export async function renewAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const renewedOn = dateOf(formData, 'renewedOn')
    if (applicationId === null) return INVALID
    if (renewedOn === null) return INVALID_DATE
    const result = await renewPermit(db, actor, { applicationId, renewedOn }, signal)
    return result.ok
      ? { ok: true, message: `Renewed. The permit now runs to ${result.value.newDue}.` }
      : { ok: false, error: errorCopy(result.error) }
  })
}
