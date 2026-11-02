import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { ledgerAllocations } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { feeBalance } from '@/features/ledger/feeBalance'
import { correctEntry } from '@/features/ledger/reversals'

type CorrectionResult = Awaited<ReturnType<typeof correctEntry>>

export async function moveFunds(
  db: Db,
  actor: Actor,
  input: { entryId: string; toApplicationId: string; amountCents: number; reason: string },
  signal: AbortSignal,
): Promise<CorrectionResult | { ok: false; error: 'no_fee_line' }> {
  const [source] = (
    await db.select().from(ledgerAllocations).where(eq(ledgerAllocations.entryId, input.entryId))
  ).filter((a) => a.targetKind === 'fee_assessment_line')
  const target = (await feeBalance(db, input.toApplicationId, signal)).lines.find(
    (l) => l.dueCents >= input.amountCents && l.stage !== 'at_renewal',
  )
  if (source?.applicationId == null || target === undefined)
    return { ok: false, error: 'no_fee_line' }
  return await correctEntry(
    db,
    actor,
    {
      entryId: input.entryId,
      reason: input.reason,
      amountDeltaCents: 0,
      allocations: [
        {
          targetKind: 'fee_assessment_line',
          applicationId: source.applicationId,
          feeAssessmentId: source.feeAssessmentId ?? undefined,
          stage: source.stage ?? undefined,
          feeCode: source.feeCode ?? undefined,
          amountCents: -input.amountCents,
        },
        {
          targetKind: 'fee_assessment_line',
          applicationId: input.toApplicationId,
          feeAssessmentId: target.feeAssessmentId,
          stage: target.stage,
          feeCode: target.feeCode,
          amountCents: input.amountCents,
        },
      ],
    },
    signal,
  )
}
