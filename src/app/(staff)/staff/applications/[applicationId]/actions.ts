'use server'

import type { Db } from '@/db/client'
import { chooseSubstep } from '@/features/applications/chooseSubstep'
import { loadApplicationContext } from '@/features/applications/context'
import { CORE_STATES, type CoreState } from '@/features/applications/states'
import { transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { recordCodeEdition } from '@/features/building/codeEdition'
import { markComplete } from '@/features/building/completeness'
import { applyCondition, setConditionStatus } from '@/features/conditions/applicationConditions'
import {
  overrideAdministrativeGate,
  recordStatutoryException,
  revokeGateOverride,
} from '@/features/gates/overrides'
import { issueApplication } from '@/features/issuance/issueApplication'
import { type ActionResult, errorCopy, runStaffAction, text } from '@/server/actionRunner'
import { dateOf, done, INVALID, INVALID_DATE, idOf } from './actionInput'

const BOARD_DECISION_ONLY =
  'Record the board decision from its hearing; that sets the outcome and the state.'

async function isBareBoardDecision(
  db: Db,
  actor: Actor,
  applicationId: string,
  to: string,
  signal: AbortSignal,
): Promise<boolean> {
  if (to !== 'decided' && to !== 'denied') return false
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return false
  const app = await loadApplicationContext(db, applicationId, signal)
  return app !== null && boardOfApplication(app) !== null
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
    if (await isBareBoardDecision(db, actor, applicationId, to, signal)) {
      return { ok: false, error: BOARD_DECISION_ONLY }
    }
    const result =
      to === 'issued'
        ? await issueApplication(db, actor, { applicationId, expectedRowVersion }, signal)
        : await db.transaction((tx) =>
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
      chooseSubstep(
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
