import { db } from '@/db/client'
import { paymentReturnStatus } from '@/features/payments/paymentReturn'
import { PaymentStatusPoller } from './PaymentStatusPoller'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const HEADINGS = {
  received: 'Payment received',
  processing: 'Payment processing',
  declined: 'Payment declined',
  not_found: 'Payment not found',
} as const

export default async function PaymentReturnPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { attemptId } = await params
  const status = UUID.test(attemptId)
    ? await paymentReturnStatus(db, attemptId, AbortSignal.timeout(10_000))
    : 'not_found'
  return (
    <main className="mx-auto max-w-md space-y-3 p-6">
      <h1>{HEADINGS[status]}</h1>
      {status === 'processing' ? (
        <>
          <p role="status">
            We are waiting for the payment processor to confirm. This page checks again every few
            seconds. Nothing is marked paid until the processor confirms.
          </p>
          <PaymentStatusPoller />
        </>
      ) : null}
      {status === 'received' ? <p>The town has recorded your payment.</p> : null}
      {status === 'declined' ? (
        <p>The payment did not go through and you were not charged. The fee is still due.</p>
      ) : null}
    </main>
  )
}
