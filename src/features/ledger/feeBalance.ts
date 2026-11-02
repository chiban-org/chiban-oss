import { and, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { paymentAttempts } from '@/db/schema'
import { assessedLines, lineKey, paidByLine } from '@/features/ledger/lineTotals'
import type { AllocationInput, FeeStageKey } from '@/features/ledger/types'

export interface FeeBalanceLine {
  stage: FeeStageKey
  feeCode: string
  label: string
  feeAssessmentId: string
  assessedCents: number
  paidCents: number
  dueCents: number
}

export interface FeeBalance {
  lines: FeeBalanceLine[]
  dueCents: number
  pendingAttempts: number
  unknownAttempts: number
}

async function countAttempts(
  db: DbOrTx,
  applicationId: string,
): Promise<{ pendingAttempts: number; unknownAttempts: number }> {
  const [row] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${paymentAttempts.outcomeUnknown} = false)::int`,
      unknown: sql<number>`count(*) filter (where ${paymentAttempts.outcomeUnknown})::int`,
    })
    .from(paymentAttempts)
    .where(
      and(
        inArray(paymentAttempts.state, ['pending', 'authorized']),
        sql`${paymentAttempts.plannedAllocations} @> ${JSON.stringify([{ applicationId }])}::jsonb`,
      ),
    )
  return { pendingAttempts: row?.pending ?? 0, unknownAttempts: row?.unknown ?? 0 }
}

export async function feeBalance(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<FeeBalance> {
  signal.throwIfAborted()
  const assessed = await assessedLines(db, applicationId)
  const paid = await paidByLine(db, applicationId)
  const lines = assessed.map((line) => {
    const paidCents = paid.get(lineKey(line.stage, line.feeCode)) ?? 0
    return {
      ...line,
      paidCents,
      dueCents: Math.max(0, line.assessedCents - paidCents),
    }
  })
  return {
    lines,
    dueCents: lines.reduce((sum, l) => sum + l.dueCents, 0),
    ...(await countAttempts(db, applicationId)),
  }
}

export function allocateToDueLines(
  applicationId: string,
  balance: FeeBalance,
  amountCents: number,
): AllocationInput[] {
  const allocations: AllocationInput[] = []
  let left = amountCents
  for (const line of balance.lines) {
    if (left <= 0) break
    const cents = Math.min(left, line.dueCents)
    if (cents <= 0) continue
    allocations.push({
      targetKind: 'fee_assessment_line',
      applicationId,
      feeAssessmentId: line.feeAssessmentId,
      stage: line.stage,
      feeCode: line.feeCode,
      amountCents: cents,
    })
    left -= cents
  }
  return allocations
}
