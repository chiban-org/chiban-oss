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

const CUMULATIVE_STAGES: readonly string[] = ['at_renewal']

function linesOf(row: typeof feeAssessments.$inferSelect): AssessedLine[] {
  const computation = row.computation as FeeComputation
  return computation.lines.flatMap((line) =>
    'value' in line.amount
      ? [
          {
            stage: row.stage,
            feeCode: line.code,
            label: line.label,
            feeAssessmentId: row.id,
            assessedCents: line.amount.value,
          },
        ]
      : [],
  )
}

function addUp(lines: AssessedLine[]): AssessedLine[] {
  const byKey = new Map<string, AssessedLine>()
  for (const line of lines) {
    const key = lineKey(line.stage, line.feeCode)
    const held = byKey.get(key)
    byKey.set(
      key,
      held === undefined
        ? line
        : { ...line, assessedCents: held.assessedCents + line.assessedCents },
    )
  }
  return [...byKey.values()]
}

export async function assessedLines(db: DbOrTx, applicationId: string): Promise<AssessedLine[]> {
  const rows = await db
    .select()
    .from(feeAssessments)
    .where(eq(feeAssessments.applicationId, applicationId))
    .orderBy(feeAssessments.assessedAt, feeAssessments.sequence)
  const latest = new Map<string, (typeof rows)[number]>()
  const cumulative: AssessedLine[] = []
  for (const row of rows) {
    const held = latest.get(row.stage)
    if (CUMULATIVE_STAGES.includes(row.stage)) cumulative.push(...linesOf(row))
    else if (held === undefined || row.sequence > held.sequence) latest.set(row.stage, row)
  }
  return [...[...latest.values()].flatMap(linesOf), ...addUp(cumulative)]
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
