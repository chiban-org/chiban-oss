import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { applications } from '@/db/schema'
import { type ApplicationContext, loadApplicationContext } from '@/features/applications/context'
import {
  type CoreState,
  isTransitionAllowed,
  TERMINAL_STATES,
} from '@/features/applications/states'
import { runTransitionEffects } from '@/features/applications/transitionEffects'
import type { AnyActor } from '@/features/audit/actorRef'
import { toAuditActor } from '@/features/audit/actorRef'
import { writeAudit } from '@/features/audit/writeAudit'
import { hasCapability } from '@/features/authz/capabilities'
import { evaluateGates, type GateResult } from '@/features/gates/evaluateGates'
import { hasFullRecordAccess, isActiveParty } from '@/features/projects/access'
import { townToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface TransitionInput {
  applicationId: string
  to: CoreState
  substep?: string
  expectedRowVersion: number
  onDate?: CivilDate
}

export type TransitionError =
  | 'forbidden'
  | 'invalid_transition'
  | 'stale_version'
  | 'not_found'
  | { gateBlocked: GateResult[] }

export interface TransitionOutcome {
  state: CoreState
  substep: string | null
  rowVersion: number
}

const NEEDS_ISSUE_CAPABILITY: readonly CoreState[] = ['issued', 'decided', 'denied']

async function isAllowedActor(
  tx: Tx,
  actor: AnyActor,
  app: ApplicationContext,
  to: CoreState,
  signal: AbortSignal,
): Promise<boolean> {
  if (actor.kind === 'system') return to === 'expired'
  if (to === 'expired' || to === 'suspended') return false
  if (NEEDS_ISSUE_CAPABILITY.includes(to)) {
    return await hasCapability(tx, actor.userId, 'permit.issue', signal)
  }
  if (hasFullRecordAccess(actor)) return true
  return (
    (to === 'submitted' || to === 'withdrawn') &&
    (await isActiveParty(tx, actor.userId, app.projectId))
  )
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
  const blocked = await evaluateGates(tx, app, input.to, today, signal)
  if (blocked.some((g) => g.effective === 'blocked')) return err({ gateBlocked: blocked })
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
    })
    .where(eq(applications.id, input.applicationId))
  await runTransitionEffects(tx, actor, app, input.to, today, signal)
  await writeAudit(
    tx,
    {
      actor: toAuditActor(actor),
      action: 'application.transition',
      entityType: 'application',
      entityId: input.applicationId,
      before: { state: app.state, substep: app.substep },
      after: { state: input.to },
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
  const app = await loadApplicationContext(tx, input.applicationId, signal)
  if (app === null) return err('not_found')
  if (!(await isAllowedActor(tx, actor, app, input.to, signal))) return err('forbidden')
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
