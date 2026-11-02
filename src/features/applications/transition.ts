import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { applications } from '@/db/schema'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import {
  type CoreState,
  isTransitionAllowed,
  TERMINAL_STATES,
} from '@/features/applications/states'
import {
  assessForTransition,
  runTransitionEffects,
} from '@/features/applications/transitionEffects'
import type { AnyActor } from '@/features/audit/actorRef'
import { toAuditActor } from '@/features/audit/actorRef'
import { writeAudit } from '@/features/audit/writeAudit'
import { hasCapability } from '@/features/authz/capabilities'
import { evaluateGates, type GateResult } from '@/features/gates/evaluateGates'
import { queueForParties } from '@/features/notifications/queue'
import { loadPack } from '@/features/packs/loadPack'
import { hasFullRecordAccess, isActiveParty } from '@/features/projects/access'
import { applyOutcomeSeries } from '@/features/records/assignments'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface TransitionInput {
  applicationId: string
  to: CoreState
  substep?: string
  expectedRowVersion: number
  onDate?: CivilDate
  closureReason?:
    | 'final_inspection_passed'
    | 'certificate_of_occupancy'
    | 'not_accepted_incomplete'
    | 'notice_costs_unpaid'
  cutover?: boolean
  boardVote?: boolean
}

export const CUTOVER_GATE_NOTE = 'Status carried from the prior system; gates not evaluated'

export type TransitionError =
  | 'forbidden'
  | 'invalid_transition'
  | 'stale_version'
  | 'fees_incomplete'
  | 'not_found'
  | { gateBlocked: GateResult[] }

export interface TransitionOutcome {
  state: CoreState
  substep: string | null
  rowVersion: number
}

const NEEDS_ISSUE_CAPABILITY: readonly CoreState[] = ['issued', 'decided', 'denied']
const BOARD_RECORD_STATES: readonly CoreState[] = ['under_review', 'decided', 'denied']

function boardOf(app: ApplicationContext): 'planning_board' | 'zba' | null {
  return (
    loadPack().classifications.find((c) => c.key === app.typeBody.classification)?.board ?? null
  )
}

async function isAllowedActor(
  tx: Tx,
  actor: AnyActor,
  app: ApplicationContext,
  to: CoreState,
  cutover: boolean,
  signal: AbortSignal,
): Promise<boolean> {
  if (actor.kind === 'system') return to === 'expired'
  if (cutover) return await hasCapability(tx, actor.userId, 'cutover.import', signal)
  if (to === 'expired' || to === 'suspended') return false
  if (app.state === 'suspended' && to === 'issued') return false
  if (boardOf(app) !== null && BOARD_RECORD_STATES.includes(to)) {
    return await hasCapability(tx, actor.userId, 'board.record', signal)
  }
  if (NEEDS_ISSUE_CAPABILITY.includes(to)) {
    return await hasCapability(tx, actor.userId, 'permit.issue', signal)
  }
  if (to === 'closed') {
    return (
      (await hasCapability(tx, actor.userId, 'permit.issue', signal)) ||
      (await hasCapability(tx, actor.userId, 'inspection.record', signal))
    )
  }
  if (hasFullRecordAccess(actor)) return true
  return to === 'withdrawn' && (await isActiveParty(tx, actor.userId, app.projectId))
}

async function gateResultsFor(
  tx: Tx,
  app: ApplicationContext,
  input: TransitionInput,
  today: CivilDate,
  reinstating: boolean,
  signal: AbortSignal,
): Promise<GateResult[]> {
  if (reinstating || input.cutover === true) return []
  return await evaluateGates(tx, app, input.to, today, signal)
}

function notifiesParties(input: TransitionInput, from: CoreState): boolean {
  if (input.cutover === true) return false
  return input.to === 'denied' || (input.to === 'issued' && from !== 'suspended')
}

export async function applyTransition(
  tx: Tx,
  actor: AnyActor,
  input: TransitionInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<TransitionOutcome, TransitionError>> {
  signal.throwIfAborted()
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .for('update')
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (app.rowVersion !== input.expectedRowVersion) return err('stale_version')
  if (!isTransitionAllowed(app.state, input.to, app.typeBody.workflow))
    return err('invalid_transition')
  const today = input.onDate ?? (await townToday(tx, now, signal))
  const reinstating = app.state === 'suspended' && input.to === 'issued'
  const results = await gateResultsFor(tx, app, input, today, reinstating, signal)
  if (results.some((g) => g.effective === 'blocked')) return err({ gateBlocked: results })
  const assessed = await assessForTransition(tx, actor, app, input.to, signal)
  if (!assessed.ok) return err(assessed.error)
  const rowVersion = app.rowVersion + 1
  const stampsDecision = input.to === 'decided' || input.to === 'denied'
  await tx
    .update(applications)
    .set({
      state: input.to,
      substep: null,
      rowVersion,
      updatedAt: new Date(),
      decidedOn: stampsDecision ? today : app.decidedOn,
      issuedOn: input.to === 'issued' ? (app.issuedOn ?? today) : app.issuedOn,
      ...(input.closureReason === undefined ? {} : { closureReason: input.closureReason }),
    })
    .where(eq(applications.id, input.applicationId))
  await runTransitionEffects(tx, app, input.to, today, signal)
  if (notifiesParties(input, app.state)) {
    await queueForParties(
      tx,
      {
        event: input.to === 'denied' ? 'application_denied' : 'application_issued',
        applicationId: input.applicationId,
      },
      signal,
    )
  }
  if (input.to === 'withdrawn' || input.to === 'denied' || input.to === 'expired') {
    await applyOutcomeSeries(tx, input.applicationId, input.to, today, signal)
  }
  await writeAudit(
    tx,
    {
      actor: toAuditActor(actor),
      action: 'application.transition',
      entityType: 'application',
      entityId: input.applicationId,
      before: { state: app.state, substep: app.substep },
      after: {
        state: input.to,
        ...(input.cutover === true ? { note: CUTOVER_GATE_NOTE } : {}),
      },
    },
    signal,
  )
  return ok({ state: input.to, substep: null, rowVersion })
}

export async function transitionApplication(
  tx: Tx,
  actor: AnyActor,
  input: TransitionInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<TransitionOutcome, TransitionError>> {
  if (input.to === 'submitted') return err('invalid_transition')
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (!(await isAllowedActor(tx, actor, app, input.to, input.cutover === true, signal))) {
    return err('forbidden')
  }
  const needsVote =
    boardOf(app) !== null && app.state === 'submitted' && input.to === 'under_review'
  if (needsVote && input.boardVote !== true) return err('invalid_transition')
  return await applyTransition(tx, actor, input, signal, now)
}

export function isTerminal(state: CoreState): boolean {
  return TERMINAL_STATES.includes(state)
}

export async function setSubstep(
  tx: Tx,
  actor: AnyActor,
  input: { applicationId: string; substep: string; expectedRowVersion: number },
  signal: AbortSignal,
): Promise<
  Result<TransitionOutcome, 'forbidden' | 'invalid_substep' | 'stale_version' | 'not_found'>
> {
  signal.throwIfAborted()
  if (actor.kind === 'system' || !hasFullRecordAccess(actor)) return err('forbidden')
  await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
    .for('update')
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (app.rowVersion !== input.expectedRowVersion) return err('stale_version')
  const declared = app.typeBody.workflow.substeps.some(
    (s) => s.state === app.state && s.key === input.substep,
  )
  if (!declared) return err('invalid_substep')
  const rowVersion = app.rowVersion + 1
  await tx
    .update(applications)
    .set({ substep: input.substep, rowVersion, updatedAt: new Date() })
    .where(eq(applications.id, input.applicationId))
  await writeAudit(
    tx,
    {
      actor: toAuditActor(actor),
      action: 'application.substep',
      entityType: 'application',
      entityId: input.applicationId,
      before: { substep: app.substep },
      after: { substep: input.substep },
    },
    signal,
  )
  return ok({ state: app.state, substep: input.substep, rowVersion })
}
