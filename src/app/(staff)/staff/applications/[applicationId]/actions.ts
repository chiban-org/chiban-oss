'use server'

import { z } from 'zod'
import type { Db } from '@/db/client'
import { chooseSubstep } from '@/features/applications/chooseSubstep'
import { loadApplicationContext } from '@/features/applications/context'
import { decideStaffApplication } from '@/features/applications/staffDecision'
import { CORE_STATES, type CoreState } from '@/features/applications/states'
import { transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { recordCodeEdition } from '@/features/building/codeEdition'
import { markComplete, markedCompleteMessage } from '@/features/building/completeness'
import { HELD_ISSUE_COPY } from '@/features/enforcement/holdCopy'
import { choice, civilDate, optionalText, requiredText } from '@/features/input/schemas'
import { issueApplication } from '@/features/issuance/issueApplication'
import { getObjectStore } from '@/features/storage/objectStore'
import { townToday } from '@/features/town/today'
import { type ActionResult, errorCopy } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { runStaffFormToday } from '@/server/formInputToday'
import { applicationIdField, denialReasonField, outcome, rowVersionField } from './actionInput'

const BOARD_DECISION_ONLY =
  'Record the board decision from its hearing; that sets the outcome and the state.'

const TRANSITION_FORM = z.object({
  applicationId: applicationIdField(),
  to: choice('a step', CORE_STATES),
  expectedRowVersion: rowVersionField(),
  reason: denialReasonField(),
})

const REASON_REQUIRED = 'Enter a reason for the denial of at least 10 characters.'

type TransitionForm = z.output<typeof TRANSITION_FORM>

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

async function hasNoBoard(db: Db, applicationId: string, signal: AbortSignal): Promise<boolean> {
  const app = await loadApplicationContext(db, applicationId, signal)
  return app !== null && boardOfApplication(app) === null
}

const APPROVED_MESSAGE = 'Approved. The decision letter is attached.'
const DENIED_MESSAGE = 'Denied. The decision letter is attached.'

function movedMessage(to: string): string {
  return `Moved to ${to.replaceAll('_', ' ')}.`
}

async function moveApplication(db: Db, actor: Actor, input: TransitionForm, signal: AbortSignal) {
  const { applicationId, to, expectedRowVersion } = input
  if (to === 'issued') {
    const issued = await issueApplication(db, actor, { applicationId, expectedRowVersion }, signal)
    return { result: issued, message: movedMessage(to) }
  }
  if ((to === 'decided' || to === 'denied') && (await hasNoBoard(db, applicationId, signal))) {
    const decidedOn = await townToday(db, new Date(), signal)
    const decided = await decideStaffApplication(
      db,
      actor,
      { applicationId, outcome: to, expectedRowVersion, reason: input.reason, decidedOn },
      getObjectStore(),
      signal,
    )
    return { result: decided, message: to === 'denied' ? DENIED_MESSAGE : APPROVED_MESSAGE }
  }
  const moved = await db.transaction((tx) =>
    transitionApplication(tx, actor, { applicationId, to, expectedRowVersion }, signal),
  )
  return { result: moved, message: movedMessage(to) }
}

export async function transitionAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(formData, TRANSITION_FORM, async ({ db, actor, signal }, input) => {
    const { applicationId, to } = input
    if (await isBareBoardDecision(db, actor, applicationId, to, signal)) {
      return { ok: false, error: BOARD_DECISION_ONLY }
    }
    const { result, message } = await moveApplication(db, actor, input, signal)
    if (result.ok) return { ok: true, message }
    if (result.error === 'parcel_held') return { ok: false, error: HELD_ISSUE_COPY }
    if (result.error === 'reason_required') return refuseField('reason', REASON_REQUIRED)
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
    async ({ db, actor, signal }, input) => {
      const marked = await markComplete(db, actor, input, signal)
      const message = marked.ok ? await markedCompleteMessage(db, input.applicationId, signal) : ''
      return outcome(marked, message, {
        before_receipt: 'completedDate',
        future_date: 'completedDate',
      })
    },
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
