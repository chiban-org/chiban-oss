'use server'

import { recordAppeal, resolveAppeal } from '@/features/appeals/appeals'
import { CORE_STATES, type CoreState } from '@/features/applications/states'
import { setSubstep, transitionApplication } from '@/features/applications/transition'
import { recordCodeEdition } from '@/features/building/codeEdition'
import { markComplete } from '@/features/building/completeness'
import {
  recordRegionalImpactDetermination,
  recordRegionalImpactNotice,
} from '@/features/building/regionalImpact'
import { renewPermit } from '@/features/building/renewal'
import { adjustClock } from '@/features/clocks/adjustClock'
import { applyCondition, setConditionStatus } from '@/features/conditions/applicationConditions'
import { createFeeOverride } from '@/features/fees/feeOverrides'
import {
  overrideAdministrativeGate,
  recordStatutoryException,
  revokeGateOverride,
} from '@/features/gates/overrides'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { parseCivilDate } from '@/types/civilDate'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INVALID: ActionResult = { ok: false, error: errorCopy('invalid_input') }
const INVALID_DATE: ActionResult = { ok: false, error: errorCopy('invalid_date') }

function done(result: { ok: true } | { ok: false; error: string }, message: string): ActionResult {
  return result.ok ? { ok: true, message } : { ok: false, error: errorCopy(result.error) }
}

function idOf(formData: FormData, key = 'applicationId'): string | null {
  const value = text(formData, key)
  return UUID.test(value) ? value : null
}

function dateOf(formData: FormData, key: string) {
  const parsed = parseCivilDate(text(formData, key))
  return parsed.ok ? parsed.value : null
}

export async function transitionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const to = text(formData, 'to')
    const expectedRowVersion = Number(text(formData, 'expectedRowVersion'))
    if (
      applicationId === null ||
      !(CORE_STATES as readonly string[]).includes(to) ||
      !Number.isInteger(expectedRowVersion)
    ) {
      return INVALID
    }
    const result = await db.transaction((tx) =>
      transitionApplication(
        tx,
        actor,
        { applicationId, to: to as CoreState, expectedRowVersion },
        signal,
      ),
    )
    if (result.ok) return { ok: true, message: `Moved to ${to.replaceAll('_', ' ')}.` }
    if (typeof result.error === 'string') return { ok: false, error: errorCopy(result.error) }
    const reasons = result.error.gateBlocked
      .filter((g) => g.effective === 'blocked' && g.outcome.status !== 'pass')
      .map((g) => (g.outcome.status === 'pass' ? '' : g.outcome.reason))
    return { ok: false, error: reasons.join(' ') }
  })
}

export async function setSubstepAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const expectedRowVersion = Number(text(formData, 'expectedRowVersion'))
    if (applicationId === null || !Number.isInteger(expectedRowVersion)) return INVALID
    const result = await db.transaction((tx) =>
      setSubstep(
        tx,
        actor,
        { applicationId, substep: text(formData, 'substep'), expectedRowVersion },
        signal,
      ),
    )
    return result.ok
      ? { ok: true, message: 'Step updated.' }
      : {
          ok: false,
          error:
            result.error === 'invalid_substep'
              ? errorCopy('invalid_input')
              : errorCopy(result.error),
        }
  })
}

export async function markCompleteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const completedDate = dateOf(formData, 'completedDate')
    if (applicationId === null) return INVALID
    if (completedDate === null) return INVALID_DATE
    return done(
      await markComplete(db, actor, { applicationId, completedDate }, signal),
      'Marked complete. The decision clock is running.',
    )
  })
}

export async function recordCodeEditionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    if (applicationId === null) return INVALID
    const election = text(formData, 'election')
    const result = await recordCodeEdition(
      db,
      actor,
      { applicationId, ...(election === '' ? {} : { election }) },
      signal,
    )
    return done(result, 'Code edition recorded.')
  })
}

export async function overrideGateAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    if (applicationId === null) return INVALID
    const result = await overrideAdministrativeGate(
      db,
      actor,
      { applicationId, gateKey: text(formData, 'gateKey'), reason: text(formData, 'reason') },
      signal,
    )
    return done(result, 'Gate overridden. The reason is on record.')
  })
}

export async function statutoryExceptionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    if (applicationId === null) return INVALID
    const result = await recordStatutoryException(
      db,
      actor,
      {
        applicationId,
        gateKey: text(formData, 'gateKey'),
        legalAuthority: {
          citation: text(formData, 'citation'),
          explanation: text(formData, 'explanation'),
        },
      },
      signal,
    )
    return done(result, 'Statutory exception recorded.')
  })
}

export async function revokeOverrideAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const overrideId = idOf(formData, 'overrideId')
    if (overrideId === null) return INVALID
    return done(await revokeGateOverride(db, actor, overrideId, signal), 'Override revoked.')
  })
}

export async function adjustClockAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const clockId = idOf(formData, 'clockId')
    const kind = text(formData, 'kind')
    if (clockId === null || !['extension', 'waiver', 'statutory_exception'].includes(kind))
      return INVALID
    const days = text(formData, 'days')
    const citation = text(formData, 'citation')
    const result = await adjustClock(
      db,
      actor,
      {
        clockId,
        kind: kind as 'extension',
        ...(days === '' ? {} : { days: Number(days) }),
        reason: text(formData, 'reason'),
        applicantConsent: text(formData, 'applicantConsent') === 'on',
        ...(citation === ''
          ? {}
          : { legalAuthority: { citation, explanation: text(formData, 'explanation') } }),
      },
      signal,
    )
    return done(result, 'Clock adjusted.')
  })
}

function cents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null
  return Math.round(Number(value) * 100)
}

export async function feeOverrideAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    const kind = text(formData, 'kind')
    if (applicationId === null || (kind !== 'waive' && kind !== 'set_amount')) return INVALID
    const amount = text(formData, 'amount')
    const amountCents = amount === '' ? null : cents(amount)
    if (amount !== '' && amountCents === null) return INVALID
    const result = await createFeeOverride(
      db,
      actor,
      {
        applicationId,
        feeCode: text(formData, 'feeCode'),
        kind,
        ...(amountCents === null ? {} : { amountCents }),
        reason: text(formData, 'reason'),
      },
      signal,
    )
    return done(result, 'Fee override saved. It applies at the next assessment.')
  })
}

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

export async function applyConditionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const applicationId = idOf(formData)
    if (applicationId === null) return INVALID
    return done(
      await applyCondition(db, actor, { applicationId, code: text(formData, 'code') }, signal),
      'Condition applied.',
    )
  })
}

export async function setConditionStatusAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async ({ db, actor, signal }) => {
    const conditionId = idOf(formData, 'conditionId')
    const status = text(formData, 'status')
    if (conditionId === null || !['unmet', 'met', 'waived'].includes(status)) return INVALID
    const reason = text(formData, 'reason')
    const result = await setConditionStatus(
      db,
      actor,
      { conditionId, status: status as 'met', ...(reason === '' ? {} : { reason }) },
      signal,
    )
    return done(result, 'Condition updated.')
  })
}
