import { z } from 'zod'
import type { ProcessorError, ProcessorPaymentState } from '@/features/payments/processors/types'
import { err, ok, type Result } from '@/types/result'

const PaymentSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  result: z.enum(['SUCCESS', 'AUTH', 'FAIL', 'VOIDED']),
  cardTransaction: z.object({ state: z.string().optional() }).nullish(),
  refunds: z
    .object({ elements: z.array(z.object({ id: z.string(), amount: z.number().int() })) })
    .nullish(),
})

const STATUS_BY_RESULT: Record<
  z.infer<typeof PaymentSchema>['result'],
  ProcessorPaymentState['status']
> = {
  SUCCESS: 'captured',
  AUTH: 'authorized',
  FAIL: 'declined',
  VOIDED: 'canceled',
}

export function mapCloverState(
  payment: unknown,
  accountRef: string,
): Result<ProcessorPaymentState, ProcessorError> {
  const parsed = PaymentSchema.safeParse(payment)
  if (!parsed.success) return err({ kind: 'bad_shape', detail: parsed.error.message })
  const value = parsed.data
  return ok({
    objectId: value.id,
    accountRef,
    status: STATUS_BY_RESULT[value.result],
    amountCents: value.amount,
    settled: value.cardTransaction?.state === 'CLOSED',
    refunds: (value.refunds?.elements ?? []).map((r) => ({
      objectId: r.id,
      amountCents: r.amount,
      status: 'succeeded' as const,
    })),
    disputes: [],
  })
}
