import { and, asc, eq, inArray, isNull, max, type SQL } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'
import {
  appealNodes,
  applications,
  boardDecisions,
  decisionDeliveries,
  projectParties,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { applicantName, applicationValues } from '@/features/abutters/applicantRecipient'
import { capitalised } from '@/features/abutters/recipientRoleLabels'
import { namedParty } from '@/features/applications/applicantName'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { markDeliveryClockMetForSource } from '@/features/decisions/deliveryClocks'
import { loadPack, type Pack } from '@/features/packs/loadPack'
import type {
  BoardKind,
  DecisionDeliveryRule,
  DeliveryMethod,
  DeliveryRecipient,
} from '@/features/packs/schema'
import { boardLabel, governingBody } from '@/features/packs/vocabulary'
import { townToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type DeliverySource = { decisionId: string } | { appealNodeId: string }

export interface PartyRecipient {
  id: string
  name: string
  role: string
}

export interface PlannedRecipient {
  role: DeliveryRecipient
  partyId: string | null
  name: string
}

export const DELIVERY_ROLE_LABELS: Record<DeliveryRecipient, string> = {
  applicant: 'Applicant',
  agent: 'Agent',
  planning_board: 'Planning board',
  municipal_officers: 'Municipal officers',
}

export function deliveryRuleFor(
  pack: Pack,
  boardKind: BoardKind | null,
): DecisionDeliveryRule | null {
  if (boardKind === null) return null
  return (
    pack.rules.find(
      (r): r is DecisionDeliveryRule =>
        r.kind === 'decision_delivery' && r.boardKinds.includes(boardKind),
    ) ?? null
  )
}

export function packDeliversDecisions(pack: Pack = loadPack()): boolean {
  return pack.rules.some((r) => r.kind === 'decision_delivery')
}

export function plannedRecipients(
  rule: DecisionDeliveryRule,
  parties: readonly PartyRecipient[],
  names: { planningBoard: string; municipalOfficers: string },
): PlannedRecipient[] {
  const fromParties = parties.flatMap((p): PlannedRecipient[] =>
    (p.role === 'applicant' || p.role === 'agent') && rule.recipients.includes(p.role)
      ? [{ role: p.role, partyId: p.id, name: p.name }]
      : [],
  )
  const fixed: PlannedRecipient[] = []
  if (rule.recipients.includes('planning_board')) {
    fixed.push({ role: 'planning_board', partyId: null, name: names.planningBoard })
  }
  if (rule.recipients.includes('municipal_officers')) {
    fixed.push({ role: 'municipal_officers', partyId: null, name: names.municipalOfficers })
  }
  return [...fromParties, ...fixed]
}

export function methodAllowed(rule: DecisionDeliveryRule, method: DeliveryMethod): boolean {
  return rule.methods.includes(method)
}

export interface Resolved {
  applicationId: string
  boardKind: BoardKind | null
  happenedOn: CivilDate
  where: SQL
  columns: { decisionId: string | null; appealNodeId: string | null }
}

export async function resolveSource(
  tx: DbOrTx,
  source: DeliverySource,
  signal: AbortSignal,
): Promise<Resolved | null> {
  if ('decisionId' in source) {
    const [decision] = await tx
      .select()
      .from(boardDecisions)
      .where(eq(boardDecisions.id, source.decisionId))
    if (decision === undefined) return null
    const app = await loadApplicationContext(tx, decision.applicationId, signal)
    return {
      applicationId: decision.applicationId,
      boardKind: app === null ? null : boardOfApplication(app),
      happenedOn: decision.votedOn as CivilDate,
      where: eq(decisionDeliveries.decisionId, decision.id),
      columns: { decisionId: decision.id, appealNodeId: null },
    }
  }
  const [node] = await tx.select().from(appealNodes).where(eq(appealNodes.id, source.appealNodeId))
  if (node?.applicationId === null || node === undefined) return null
  return {
    applicationId: node.applicationId,
    boardKind: node.kind === 'zba_decision' ? 'zba' : null,
    happenedOn: node.occurredOn as CivilDate,
    where: eq(decisionDeliveries.appealNodeId, node.id),
    columns: { decisionId: null, appealNodeId: node.id },
  }
}

export async function planDeliveries(
  tx: Tx,
  source: DeliverySource,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  if (!packDeliversDecisions()) return
  const resolved = await resolveSource(tx, source, signal)
  if (resolved === null) return
  const rule = deliveryRuleFor(loadPack(), resolved.boardKind)
  if (rule === null) return
  const [existing] = await tx
    .select({ id: decisionDeliveries.id })
    .from(decisionDeliveries)
    .where(resolved.where)
    .limit(1)
  if (existing !== undefined) return
  const parties = await tx
    .select({ id: projectParties.id, name: projectParties.name, role: projectParties.role })
    .from(applications)
    .innerJoin(projectParties, eq(projectParties.projectId, applications.projectId))
    .where(
      and(
        eq(applications.id, resolved.applicationId),
        isNull(projectParties.removedAt),
        inArray(projectParties.role, ['applicant', 'agent']),
      ),
    )
    .orderBy(asc(projectParties.role), asc(projectParties.name))
  const applicant = await applicantName(
    tx,
    resolved.applicationId,
    await applicationValues(tx, resolved.applicationId),
  )
  const named = parties.map((p) =>
    p.role === 'applicant' ? { ...p, name: namedParty(p.name) ?? applicant ?? p.name } : p,
  )
  const planned = plannedRecipients(rule, named, {
    planningBoard: boardLabel('planning_board'),
    municipalOfficers: capitalised(governingBody()),
  })
  if (planned.length === 0) return
  await tx.insert(decisionDeliveries).values(
    planned.map((p) => ({
      applicationId: resolved.applicationId,
      ...resolved.columns,
      recipientRole: p.role,
      partyId: p.partyId,
      recipientName: p.name,
    })),
  )
}

export type DeliveryError =
  | 'forbidden'
  | 'not_found'
  | 'already_recorded'
  | 'future_date'
  | 'before_vote'
  | 'method_not_allowed'

export async function recordDecisionDelivery(
  db: Db,
  actor: Actor,
  input: { deliveryId: string; method: DeliveryMethod; deliveredOn: CivilDate },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, DeliveryError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<void, DeliveryError>(db, async (tx) => {
    const [found] = await tx
      .select({ applicationId: decisionDeliveries.applicationId })
      .from(decisionDeliveries)
      .where(eq(decisionDeliveries.id, input.deliveryId))
    if (found === undefined) return err('not_found')
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, found.applicationId))
      .for('update')
    const [row] = await tx
      .select()
      .from(decisionDeliveries)
      .where(eq(decisionDeliveries.id, input.deliveryId))
      .for('update')
    if (row === undefined) return err('not_found')
    if (row.deliveredOn !== null) return err('already_recorded')
    const source: DeliverySource =
      row.decisionId === null
        ? { appealNodeId: row.appealNodeId ?? '' }
        : { decisionId: row.decisionId }
    const resolved = await resolveSource(tx, source, signal)
    if (resolved === null) return err('not_found')
    const rule = deliveryRuleFor(loadPack(), resolved.boardKind)
    if (rule === null || !methodAllowed(rule, input.method)) return err('method_not_allowed')
    if (compareCivil(input.deliveredOn, await townToday(tx, now, signal)) > 0) {
      return err('future_date')
    }
    if (compareCivil(input.deliveredOn, resolved.happenedOn) < 0) return err('before_vote')
    await tx
      .update(decisionDeliveries)
      .set({
        method: input.method,
        deliveredOn: input.deliveredOn,
        recordedBy: actor.userId,
        recordedAt: now,
      })
      .where(eq(decisionDeliveries.id, row.id))
    const [rest] = await tx
      .select({ latest: max(decisionDeliveries.deliveredOn) })
      .from(decisionDeliveries)
      .where(resolved.where)
    const undelivered = await tx
      .select({ id: decisionDeliveries.id })
      .from(decisionDeliveries)
      .where(and(resolved.where, isNull(decisionDeliveries.deliveredOn)))
      .limit(1)
    if (undelivered.length === 0 && rest?.latest !== null && rest?.latest !== undefined) {
      await markDeliveryClockMetForSource(
        tx,
        row.applicationId,
        rule.dueRuleKey,
        resolved.happenedOn,
        rest.latest as CivilDate,
      )
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'decision.delivery_recorded',
        entityType: 'application',
        entityId: row.applicationId,
        after: {
          deliveryId: row.id,
          recipientRole: row.recipientRole,
          method: input.method,
          deliveredOn: input.deliveredOn,
        },
      },
      signal,
    )
    return ok(undefined)
  })
}
