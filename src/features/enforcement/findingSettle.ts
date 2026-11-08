import { and, eq, inArray, ne, notInArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  counselOutcomes,
  counselReferrals,
  type EnforcementStatus,
  enforcementCases,
  enforcementOrders,
  type OrderStatus,
  orderCourtSteps,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'

type CaseRow = typeof enforcementCases.$inferSelect

async function somethingWentOut(tx: Tx, caseId: string): Promise<boolean> {
  const [notice] = await tx
    .select({ id: violationNotices.id })
    .from(violationNotices)
    .where(eq(violationNotices.caseId, caseId))
    .limit(1)
  if (notice !== undefined) return true
  const [order] = await tx
    .select({ id: enforcementOrders.id })
    .from(enforcementOrders)
    .where(
      and(
        eq(enforcementOrders.caseId, caseId),
        notInArray(enforcementOrders.status, ['withdrawn', 'draft']),
      ),
    )
    .limit(1)
  return order !== undefined
}

async function discardDrafts(tx: Tx, actor: Actor, caseId: string, signal: AbortSignal) {
  const drafts = await tx
    .select()
    .from(enforcementOrders)
    .where(and(eq(enforcementOrders.caseId, caseId), eq(enforcementOrders.status, 'draft')))
  for (const draft of drafts) {
    await tx
      .update(enforcementOrders)
      .set({ status: 'withdrawn', rowVersion: draft.rowVersion + 1 })
      .where(eq(enforcementOrders.id, draft.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.order_draft_discarded',
        entityType: 'enforcement_order',
        entityId: draft.id,
        before: { status: 'draft' },
        after: { status: 'withdrawn', reason: 'Every finding on the draft was withdrawn.' },
      },
      signal,
    )
  }
}

export async function returnCaseIfAllWithdrawn(
  tx: Tx,
  actor: Actor,
  caseRow: CaseRow,
  signal: AbortSignal,
): Promise<EnforcementStatus> {
  if (caseRow.status !== 'violation_found') return caseRow.status
  const [standing] = await tx
    .select({ id: violationFindings.id })
    .from(violationFindings)
    .where(and(eq(violationFindings.caseId, caseRow.id), ne(violationFindings.status, 'withdrawn')))
    .limit(1)
  if (standing !== undefined || (await somethingWentOut(tx, caseRow.id))) return caseRow.status
  await discardDrafts(tx, actor, caseRow.id, signal)
  await tx
    .update(enforcementCases)
    .set({ status: 'investigating', rowVersion: caseRow.rowVersion + 1, updatedAt: new Date() })
    .where(eq(enforcementCases.id, caseRow.id))
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'enforcement.case_status',
      entityType: 'enforcement_case',
      entityId: caseRow.id,
      before: { status: caseRow.status },
      after: { status: 'investigating', reason: 'Every finding was withdrawn.' },
    },
    signal,
  )
  return 'investigating'
}

const IN_FORCE: readonly OrderStatus[] = [
  'issued',
  'served',
  'answered',
  'filed_with_court',
  'motion_filed',
]

function allSettled(findingIds: readonly string[], statusOf: Map<string, string>): boolean {
  const statuses = findingIds.map((id) => statusOf.get(id) ?? 'open')
  return !statuses.includes('open') && statuses.includes('corrected')
}

const COUNSEL_JUDGMENTS = ['judgment_for_town', 'judgment_for_respondent'] as const

async function counselJudged(tx: Tx, caseId: string): Promise<boolean> {
  const [judged] = await tx
    .select({ id: counselOutcomes.id })
    .from(counselOutcomes)
    .innerJoin(counselReferrals, eq(counselReferrals.id, counselOutcomes.referralId))
    .where(
      and(
        eq(counselReferrals.caseId, caseId),
        inArray(counselOutcomes.kind, [...COUNSEL_JUDGMENTS]),
      ),
    )
    .limit(1)
  return judged !== undefined
}

export async function settleCompliedOrders(
  tx: Tx,
  actor: Actor,
  caseId: string,
  signal: AbortSignal,
): Promise<void> {
  const orders = await tx
    .select()
    .from(enforcementOrders)
    .where(and(eq(enforcementOrders.caseId, caseId), inArray(enforcementOrders.status, IN_FORCE)))
  if (orders.length === 0) return
  const findings = await tx
    .select({ id: violationFindings.id, status: violationFindings.status })
    .from(violationFindings)
    .where(eq(violationFindings.caseId, caseId))
  const statusOf = new Map(findings.map((f) => [f.id, f.status]))
  const judged = await tx
    .select({ orderId: orderCourtSteps.orderId })
    .from(orderCourtSteps)
    .where(
      and(
        inArray(
          orderCourtSteps.orderId,
          orders.map((o) => o.id),
        ),
        eq(orderCourtSteps.kind, 'judgment'),
      ),
    )
  if (await counselJudged(tx, caseId)) return
  const judgedIds = new Set(judged.map((j) => j.orderId))
  for (const order of orders) {
    if (judgedIds.has(order.id) || !allSettled(order.findingIds, statusOf)) continue
    await tx
      .update(enforcementOrders)
      .set({ status: 'complied', rowVersion: order.rowVersion + 1 })
      .where(eq(enforcementOrders.id, order.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'enforcement.order_complied',
        entityType: 'enforcement_order',
        entityId: order.id,
        before: { status: order.status },
        after: { status: 'complied', reason: 'Every finding on the order was corrected.' },
      },
      signal,
    )
  }
}
