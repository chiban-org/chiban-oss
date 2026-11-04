import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import type { PaymentsOverview } from '@/features/payments/overview'
import { formatCents } from '@/lib/money'
import { words } from '@/lib/words'

type Attempt = PaymentsOverview['unknownAttempts'][number]

function AttemptLink({ attempt }: { attempt: Attempt }) {
  return (
    <Link href={`/staff/payments/${attempt.id}`}>
      {`${formatCents(attempt.amountCents)} from ${attempt.payerName}`}
    </Link>
  )
}

export function PaymentAlerts({
  overview,
}: {
  overview: Pick<PaymentsOverview, 'unknownAttempts' | 'anomalies' | 'overpayments'>
}) {
  const { unknownAttempts, anomalies, overpayments } = overview
  if (unknownAttempts.length + anomalies.length + overpayments.length === 0) {
    return <p>No card payment needs attention.</p>
  }
  return (
    <>
      {unknownAttempts.length === 0 ? null : (
        <section aria-label="Outcome unknown">
          <h2>Card payments with an unknown outcome</h2>
          <ul className="space-y-2">
            {unknownAttempts.map((a) => (
              <li key={a.id}>
                <AttemptLink attempt={a} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {anomalies.length === 0 ? null : (
        <section aria-label="Anomalies">
          <h2>Anomalies</h2>
          <ul className="space-y-2">
            {anomalies.map((a) => (
              <li key={a.id}>
                <StatusChip status="failed" label={words(a.anomaly ?? '')} />{' '}
                <AttemptLink attempt={a} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {overpayments.length === 0 ? null : (
        <section aria-label="Overpayments">
          <h2>Overpayment to refund</h2>
          <ul className="space-y-2">
            {overpayments.map((o) => (
              <li key={o.applicationId}>
                <Link href={`/staff/applications/${o.applicationId}`}>
                  {`${o.applicationNumber}: ${formatCents(o.amountCents)}`}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
