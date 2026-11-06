'use server'

import { z } from 'zod'
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
import { choice, civilDate, optionalText, requiredText } from '@/features/input/schemas'
import { issueApplication } from '@/features/issuance/issueApplication'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { applicationIdField, outcome, rowVersionField } from './actionInput'

const BOARD_DECISION_ONLY =
  'Record the board decision from its hearing; that sets the outcome and the state.'

const TRANSITION_FORM = z.object({
  applicationId: applicationIdField(),
  to: choice('a step', CORE_STATES),
  expectedRowVersion: rowVersionField(),
})

const SUBSTEP_FORM = z.object({
  applicationId: applicationIdField(),
  substep: requiredText('a step', { max: 200 }),
  expectedRowVersion: rowVersionField(),
})

const CODE_EDITION_FORM = z.object({
  applicationId: applicationIdField(),
  election: optionalText('a code edition', { max: 100 }),
})

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
  return await runStaffForm(formData, TRANSITION_FORM, async ({ db, actor, signal }, input) => {
    const { applicationId, to, expectedRowVersion } = input
    if (await isBareBoardDecision(db, actor, applicationId, to, signal)) {
      return { ok: false, error: BOARD_DECISION_ONLY }
    }
    const result =
      to === 'issued'
        ? await issueApplication(db, actor, { applicationId, expectedRowVersion }, signal)
        : await db.transaction((tx) =>
            transitionApplication(tx, actor, { applicationId, to, expectedRowVersion }, signal),
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
  return await runStaffForm(formData, SUBSTEP_FORM, async ({ db, actor, signal }, input) => {
    const result = await db.transaction((tx) => chooseSubstep(tx, actor, input, signal))
    if (!result.ok && result.error === 'invalid_substep') {
      return refuseField('substep', 'Choose a step from the list.')
    }
    return outcome(result, 'Step updated.')
  })
}

export async function markCompleteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffFormToday(
    formData,
    (today) =>
      z.object({
        applicationId: applicationIdField(),
        completedDate: civilDate('the completed date', { latest: today }),
      }),
    async ({ db, actor, signal }, input) =>
      outcome(
        await markComplete(db, actor, input, signal),
        'Marked complete. The decision clock is running.',
        { before_receipt: 'completedDate', future_date: 'completedDate' },
      ),
  )
}

export async function recordCodeEditionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, CODE_EDITION_FORM, async ({ db, actor, signal }, input) => {
    const result = await recordCodeEdition(
      db,
      actor,
      {
        applicationId: input.applicationId,
        ...(input.election === null ? {} : { election: input.election }),
      },
      signal,
    )
    return outcome(result, 'Code edition recorded.', { election_not_allowed: 'election' })
  })
}
