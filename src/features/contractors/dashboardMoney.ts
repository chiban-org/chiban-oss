import { and, eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { feeAssessments, ledgerAllocations } from '@/db/schema'
import { assessedLinesFromRows, lineKey } from '@/features/ledger/lineTotals'

export async function dueCentsFor(
  db: DbOrTx,
  applicationIds: readonly string[],
): Promise<Map<string, number>> {
  const due = new Map<string, number>()
  if (applicationIds.length === 0) return due
  const ids = [...applicationIds]
  const [assessments, paidRows] = await Promise.all([
    db
      .select()
      .from(feeAssessments)
      .where(inArray(feeAssessments.applicationId, ids))
      .orderBy(feeAssessments.assessedAt, feeAssessments.sequence),
    db
      .select({
        applicationId: ledgerAllocations.applicationId,
        stage: ledgerAllocations.stage,
        feeCode: ledgerAllocations.feeCode,
        paid: sql<number>`sum(${ledgerAllocations.amountCents})::int`,
      })
      .from(ledgerAllocations)
      .where(
        and(
          inArray(ledgerAllocations.applicationId, ids),
          eq(ledgerAllocations.targetKind, 'fee_assessment_line'),
        ),
      )
      .groupBy(ledgerAllocations.applicationId, ledgerAllocations.stage, ledgerAllocations.feeCode),
  ])
  const paid = new Map(
    paidRows.map((r) => [`${r.applicationId}|${lineKey(r.stage ?? '', r.feeCode ?? '')}`, r.paid]),
  )
  const byApplication = new Map<string, typeof assessments>()
  for (const row of assessments) {
    byApplication.set(row.applicationId, [...(byApplication.get(row.applicationId) ?? []), row])
  }
  for (const [applicationId, rows] of byApplication) {
    const owed = assessedLinesFromRows(rows).reduce(
      (sum, line) =>
        sum +
        Math.max(
          0,
          line.assessedCents -
            (paid.get(`${applicationId}|${lineKey(line.stage, line.feeCode)}`) ?? 0),
        ),
      0,
    )
    due.set(applicationId, owed)
  }
  return due
}
