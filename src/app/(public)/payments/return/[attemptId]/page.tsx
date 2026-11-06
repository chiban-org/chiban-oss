import type { Metadata } from 'next'
import { NEW_TAB } from '@/components/newTab'
import { DescriptionList } from '@/components/ui/description-list'
import { db } from '@/db/client'
import { type PaymentReturnDetails, paymentReturnDetails } from '@/features/payments/paymentReturn'
import { formatCents } from '@/lib/money'
import { portalActorOrNull } from '@/server/requirePortal'
import { PaymentStatusPoller } from './PaymentStatusPoller'

export const metadata: Metadata = { title: 'Payment' }

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const NOT_FOUND_DETAILS: PaymentReturnDetails = {
  status: 'not_found',
  simulated: false,
  amountCents: null,
  applicationNumbers: [],
  applications: [],
  receiptId: null,
}

const LINK = 'tap-target inline-flex items-center'

function ApplicationLinks({
  details,
  label,
}: {
  details: PaymentReturnDetails
  label: (number: string) => string
}) {
  if (details.applications.length === 0) return null
  return (
    <ul className="list-none space-y-1 p-0">
      {details.applications.map((a) => (
        <li key={a.id}>
          <a href={`/portal/applications/${a.id}`} className={LINK}>
            {label(a.number)}
          </a>
        </li>
      ))}
    </ul>
  )
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
  const signal = AbortSignal.timeout(10_000)
  const actor = await portalActorOrNull(signal)
  const details = UUID.test(attemptId)
    ? await paymentReturnDetails(db, actor, attemptId, signal)
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
          <DescriptionList
            labelWidth="narrow"
            items={[
              { label: 'Amount', value: formatCents(details.amountCents ?? 0) },
              { label: 'For', value: details.applicationNumbers.join(', ') },
            ]}
          />
          <p>
            <a {...NEW_TAB} href={`/payments/receipt/${attemptId}`} className={LINK}>
              Open your receipt
            </a>
          </p>
          <ApplicationLinks details={details} label={(n) => `Back to ${n}`} />
        </>
      ) : null}
      {status === 'declined' ? (
        <>
          <p>The payment did not go through and you were not charged. The fee is still due.</p>
          <ApplicationLinks details={details} label={(n) => `Try the payment again from ${n}`} />
        </>
      ) : null}
    </main>
  )
}
