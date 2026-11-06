import Link from 'next/link'
import { TablePager } from '@/components/dataTable/TablePager'
import { StatusChip } from '@/components/StatusChip'
import type { TableParams } from '@/features/dataTable/params'
import { type FlaggedKind, flaggedPageHref } from '@/features/payments/flaggedAttempts'
import type { PaymentsOverview } from '@/features/payments/overview'
import { PAYMENT_ALERT_IDS } from '@/features/payments/paymentAlertIds'
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

function FlaggedPager({
  overview,
  params,
  kind,
  shown,
}: {
  overview: Pick<PaymentsOverview, 'flaggedPages'>
  params: TableParams
  kind: FlaggedKind
  shown: number
}) {
  const page = overview.flaggedPages[kind]
  const href = (offset: number | null) =>
    flaggedPageHref(params, kind, PAYMENT_ALERT_IDS[kind], offset)
  return (
    <TablePager
      offset={page.offset}
      shown={shown}
      total={page.total}
      prevHref={href(page.prevOffset)}
      nextHref={href(page.nextOffset)}
    />
  )
}

export function PaymentAlerts({
  overview,
  params,
}: {
  overview: Pick<
    PaymentsOverview,
    'unknownAttempts' | 'anomalies' | 'overpayments' | 'flaggedPages'
  >
  params: TableParams
}) {
  const { unknownAttempts, anomalies, overpayments, flaggedPages } = overview
  if (flaggedPages.unknown.total + flaggedPages.anomalies.total + overpayments.length === 0) {
    return <p>No card payment needs attention.</p>
  }
  return (
    <>
      {flaggedPages.unknown.total === 0 ? null : (
        <section id={PAYMENT_ALERT_IDS.unknown} aria-label="Outcome unknown">
          <h2>Card payments with an unknown outcome</h2>
          <ul className="space-y-2">
            {unknownAttempts.map((a) => (
              <li key={a.id}>
                <AttemptLink attempt={a} />
              </li>
            ))}
          </ul>
          <FlaggedPager
            overview={overview}
            params={params}
            kind="unknown"
            shown={unknownAttempts.length}
          />
        </section>
      )}
      {flaggedPages.anomalies.total === 0 ? null : (
        <section id={PAYMENT_ALERT_IDS.anomalies} aria-label="Anomalies">
          <h2>Anomalies</h2>
          <ul className="space-y-2">
            {anomalies.map((a) => (
              <li key={a.id}>
                <StatusChip status="failed" label={words(a.anomaly ?? '')} />{' '}
                <AttemptLink attempt={a} />
              </li>
            ))}
          </ul>
          <FlaggedPager
            overview={overview}
            params={params}
            kind="anomalies"
            shown={anomalies.length}
          />
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
