import { and, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { feeAssessments, ledgerAllocations } from '@/db/schema'
import type { FeeComputation } from '@/features/fees/computeFees'
import type { FeeStageKey } from '@/features/ledger/types'

export interface AssessedLine {
  stage: FeeStageKey
  feeCode: string
  label: string
  feeAssessmentId: string
  assessedCents: number
}

export function lineKey(stage: string, feeCode: string): string {
  return `${stage}|${feeCode}`
}

export async function assessedLines(db: DbOrTx, applicationId: string): Promise<AssessedLine[]> {
  const rows = await db
    .select()
    .from(feeAssessments)
    .where(eq(feeAssessments.applicationId, applicationId))
  const latest = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const current = latest.get(row.stage)
    if (current === undefined || row.sequence > current.sequence) latest.set(row.stage, row)
  }
  const lines: AssessedLine[] = []
  for (const row of latest.values()) {
    const computation = row.computation as FeeComputation
    for (const line of computation.lines) {
      if (!('value' in line.amount)) continue
      lines.push({
        stage: row.stage,
        feeCode: line.code,
        label: line.label,
        feeAssessmentId: row.id,
        assessedCents: line.amount.value,
      })
    }
  }
  return lines
}

export async function paidByLine(db: DbOrTx, applicationId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      stage: ledgerAllocations.stage,
      feeCode: ledgerAllocations.feeCode,
      paid: sql<number>`sum(${ledgerAllocations.amountCents})::int`,
    })
    .from(ledgerAllocations)
    .where(
      and(
        eq(ledgerAllocations.applicationId, applicationId),
        eq(ledgerAllocations.targetKind, 'fee_assessment_line'),
      ),
    )
    .groupBy(ledgerAllocations.stage, ledgerAllocations.feeCode)
  return new Map(rows.map((r) => [lineKey(r.stage ?? '', r.feeCode ?? ''), r.paid]))
}
