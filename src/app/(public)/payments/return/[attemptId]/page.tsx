import type { Metadata } from 'next'
import { PracticeNotice } from '@/components/PracticeNotice'
import { db } from '@/db/client'
import { type PaymentReturnDetails, paymentReturnDetails } from '@/features/payments/paymentReturn'
import { loadPublicTown } from '@/features/town/publicTown'
import { portalActorOrNull } from '@/server/requirePortal'
import { PaymentStatusPoller } from './PaymentStatusPoller'
import { ApplicationLinks, NotFoundHelp, ReceivedReceipt } from './ReturnSections'

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
  receiptNumber: null,
  lines: [],
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
  const [actor, town] = await Promise.all([portalActorOrNull(signal), loadPublicTown(db, signal)])
  const details = UUID.test(attemptId)
    ? await paymentReturnDetails(db, actor, attemptId, signal)
    : NOT_FOUND_DETAILS
  const { status } = details
  return (
    <main>
      <h1>{HEADINGS[status]}</h1>
      {details.simulated ? (
        <PracticeNotice>SIMULATED: no card was charged. This is a practice payment.</PracticeNotice>
      ) : null}
      {status === 'processing' ? (
        <>
          <PaymentStatusPoller />
          <ApplicationLinks details={details} label={(n) => `Go to ${n}`} />
        </>
      ) : null}
      {status === 'received' ? <ReceivedReceipt details={details} attemptId={attemptId} /> : null}
      {status === 'declined' ? (
        <>
          <p>The payment did not go through and you were not charged. The fee is still due.</p>
          <ApplicationLinks details={details} label={(n) => `Try the payment again from ${n}`} />
        </>
      ) : null}
      {status === 'not_found' ? (
        <NotFoundHelp signedIn={actor !== null} attemptId={attemptId} office={town.office} />
      ) : null}
    </main>
  )
}
