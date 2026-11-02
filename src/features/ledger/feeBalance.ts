import type { DbOrTx } from '@/db/client'
import { assessedLines, lineKey, paidByLine } from '@/features/ledger/lineTotals'
import type { FeeStageKey } from '@/features/ledger/types'

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
  return { lines, dueCents: lines.reduce((sum, l) => sum + l.dueCents, 0) }
}
