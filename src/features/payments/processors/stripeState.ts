import { z } from 'zod'
import type { ProcessorError, ProcessorPaymentState } from '@/features/payments/processors/types'
import { err, ok, type Result } from '@/types/result'

const PaymentIntentSchema = z.object({
  id: z.string().min(1),
  amount: z.number().int(),
  status: z.string(),
  latest_charge: z
    .object({
      balance_transaction: z.object({ status: z.string() }).nullish(),
    })
    .nullish(),
})

const ListSchema = <T extends z.ZodType>(item: T) => z.object({ data: z.array(item) })

const RefundSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  status: z.string().nullable(),
})

const DisputeSchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  status: z.string(),
})

const PENDING_STATUSES = new Set([
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
])

function intentStatus(status: string): ProcessorPaymentState['status'] | null {
  if (PENDING_STATUSES.has(status)) return 'pending'
  if (status === 'requires_capture') return 'authorized'
  if (status === 'succeeded') return 'captured'
  if (status === 'canceled') return 'canceled'
  return null
}

function refundStatus(status: string | null): ProcessorPaymentState['refunds'][number]['status'] {
  if (status === 'succeeded') return 'succeeded'
  if (status === 'failed' || status === 'canceled') return 'failed'
  return 'pending'
}

function disputeStatus(status: string): 'open' | 'won' | 'lost' | null {
  if (status.startsWith('warning_')) return null
  if (status === 'won') return 'won'
  if (status === 'lost') return 'lost'
  return 'open'
}

function badShape(detail: string): Result<never, ProcessorError> {
  return err({ kind: 'bad_shape', detail })
}

export function mapStripeState(
  paymentIntent: unknown,
  refundList: unknown,
  disputeList: unknown,
  accountRef: string,
): Result<ProcessorPaymentState, ProcessorError> {
  const pi = PaymentIntentSchema.safeParse(paymentIntent)
  const refunds = ListSchema(RefundSchema).safeParse(refundList)
  const disputes = ListSchema(DisputeSchema).safeParse(disputeList)
  if (!pi.success) return badShape(`payment intent: ${pi.error.message}`)
  if (!refunds.success) return badShape(`refund list: ${refunds.error.message}`)
  if (!disputes.success) return badShape(`dispute list: ${disputes.error.message}`)
  const status = intentStatus(pi.data.status)
  if (status === null) return badShape(`unknown payment intent status ${pi.data.status}`)
  return ok({
    objectId: pi.data.id,
    accountRef,
    status,
    amountCents: pi.data.amount,
    settled: pi.data.latest_charge?.balance_transaction?.status === 'available',
    refunds: refunds.data.data.map((r) => ({
      objectId: r.id,
      amountCents: r.amount,
      status: refundStatus(r.status),
    })),
    disputes: disputes.data.data.flatMap((d) => {
      const mapped = disputeStatus(d.status)
      return mapped === null ? [] : [{ objectId: d.id, amountCents: d.amount, status: mapped }]
    }),
  })
}
