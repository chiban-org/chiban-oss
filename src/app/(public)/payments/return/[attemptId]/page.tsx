import { db } from '@/db/client'
import { type PaymentReturnDetails, paymentReturnDetails } from '@/features/payments/paymentReturn'
import { formatCents } from '@/lib/money'
import { PaymentStatusPoller } from './PaymentStatusPoller'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NOT_FOUND_DETAILS: PaymentReturnDetails = {
  status: 'not_found',
  simulated: false,
  amountCents: null,
  applicationNumbers: [],
  receiptId: null,
}

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
  const details = UUID.test(attemptId)
    ? await paymentReturnDetails(db, attemptId, AbortSignal.timeout(10_000))
    : NOT_FOUND_DETAILS
  const { status } = details
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
      {details.simulated ? (
        <p role="note" className="rounded-md bg-highlight px-3 py-2 font-semibold">
          SIMULATED: no card was charged. This is a practice payment.
        </p>
      ) : null}
      {status === 'received' ? (
        <>
          <p>The town has recorded your payment.</p>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
            <dt className="font-semibold">Amount</dt>
            <dd>{formatCents(details.amountCents ?? 0)}</dd>
            <dt className="font-semibold">For</dt>
            <dd>{details.applicationNumbers.join(', ')}</dd>
          </dl>
          <p>
            <a
              href={`/payments/receipt/${attemptId}`}
              className="tap-target inline-flex items-center text-action underline"
            >
              Open your receipt
            </a>
          </p>
        </>
      ) : null}
      {status === 'declined' ? (
        <p>The payment did not go through and you were not charged. The fee is still due.</p>
      ) : null}
    </main>
  )
}
