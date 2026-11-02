import { randomUUID } from 'node:crypto'
import type { Tx } from '@/db/client'
import { paymentAttempts } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { feeBalance } from '@/features/ledger/feeBalance'
import type { AllocationInput } from '@/features/ledger/types'
import { computeConvenienceFee } from '@/features/payments/convenienceFee'
import { getPaymentSettings } from '@/features/payments/paymentSettings'
import { getActiveProcessor } from '@/features/payments/processorAccounts'
import { err, ok, type Result } from '@/types/result'

export interface CreateAttemptInput {
  channel: 'card_online' | 'card_present'
  applicationIds: string[]
  payerName: string
  payerEmail?: string
  payerUserId?: string
}

export async function createAttempt(
  tx: Tx,
  actor: Actor | null,
  input: CreateAttemptInput,
  signal: AbortSignal,
): Promise<Result<{ attemptId: string; amountCents: number }, 'nothing_due' | 'not_configured'>> {
  signal.throwIfAborted()
  const processor = await getActiveProcessor(tx, signal)
  if (processor.state !== 'known') return err('not_configured')
  const planned: AllocationInput[] = []
  for (const applicationId of input.applicationIds) {
    const balance = await feeBalance(tx, applicationId, signal)
    for (const line of balance.lines) {
      if (line.dueCents <= 0) continue
      planned.push({
        targetKind: 'fee_assessment_line',
        applicationId,
        feeAssessmentId: line.feeAssessmentId,
        stage: line.stage,
        feeCode: line.feeCode,
        amountCents: line.dueCents,
      })
    }
  }
  const baseCents = planned.reduce((sum, a) => sum + a.amountCents, 0)
  if (baseCents === 0) return err('nothing_due')
  const settings = await getPaymentSettings(tx, signal)
  const feeCents = computeConvenienceFee(baseCents, settings.convenienceFee, input.channel)
  if (feeCents > 0) {
    planned.push({
      targetKind: 'convenience_fee',
      applicationId: input.applicationIds[0],
      amountCents: feeCents,
    })
  }
  const [row] = await tx
    .insert(paymentAttempts)
    .values({
      processorAccountId: processor.value.account.id,
      channel: input.channel,
      baseCents,
      convenienceFeeCents: feeCents,
      amountCents: baseCents + feeCents,
      plannedAllocations: planned,
      payerName: input.payerName,
      payerEmail: input.payerEmail ?? null,
      payerUserId: input.payerUserId ?? null,
      idempotencyKey: randomUUID(),
      createdByUserId: actor?.userId ?? null,
    })
    .returning({ id: paymentAttempts.id })
  return ok({ attemptId: row?.id ?? '', amountCents: baseCents + feeCents })
}
