import { type AnyColumn, and, asc, eq, sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  enforcementCases,
  enforcementOrders,
  violationFindings,
  violationNotices,
} from '@/db/schema'

export type FindingRow = typeof violationFindings.$inferSelect
export type CaseRow = typeof enforcementCases.$inferSelect

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

export async function lockCaseOrders(tx: Tx, caseId: string): Promise<void> {
  await tx
    .select({ id: enforcementOrders.id })
    .from(enforcementOrders)
    .where(eq(enforcementOrders.caseId, caseId))
    .orderBy(asc(enforcementOrders.id))
    .for('update')
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
  await lockCaseOrders(tx, found.caseId)
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
