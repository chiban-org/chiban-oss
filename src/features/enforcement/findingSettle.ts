import { type AnyColumn, and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
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

export type FindingRow = typeof violationFindings.$inferSelect
type CaseRow = typeof enforcementCases.$inferSelect

export async function findingInUse(tx: Tx, finding: FindingRow): Promise<boolean> {
  const contains = (column: AnyColumn) => sql`${finding.id}::uuid = any(${column})`
  const [notice] = await tx
    .select({ id: violationNotices.id })
    .from(violationNotices)
    .where(and(eq(violationNotices.caseId, finding.caseId), contains(violationNotices.findingIds)))
    .limit(1)
  if (notice !== undefined) return true
  const [order] = await tx
    .select({ id: enforcementOrders.id })
    .from(enforcementOrders)
    .where(
      and(eq(enforcementOrders.caseId, finding.caseId), contains(enforcementOrders.findingIds)),
    )
    .limit(1)
  return order !== undefined
}

export async function lockFindingWithCase(
  tx: Tx,
  findingId: string,
): Promise<{ finding: FindingRow; caseRow: CaseRow } | null> {
  const [found] = await tx
    .select({ caseId: violationFindings.caseId })
    .from(violationFindings)
    .where(eq(violationFindings.id, findingId))
  if (found === undefined) return null
  const [caseRow] = await tx
    .select()
    .from(enforcementCases)
    .where(eq(enforcementCases.id, found.caseId))
    .for('update')
  const [finding] = await tx
    .select()
    .from(violationFindings)
    .where(eq(violationFindings.id, findingId))
    .for('update')
  if (caseRow === undefined || finding === undefined) return null
  return { finding, caseRow }
}

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
    .where(and(eq(enforcementOrders.caseId, caseId), ne(enforcementOrders.status, 'withdrawn')))
    .limit(1)
  return order !== undefined
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
