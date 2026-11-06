import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PaymentsOverview } from '@/features/payments/overview'
import { PAYMENT_ALERT_IDS } from '@/features/payments/paymentAlertIds'
import { PaymentAlerts } from './PaymentAlerts'

type Attempt = PaymentsOverview['unknownAttempts'][number]

const attempt = {
  id: 'a1',
  amountCents: 4500,
  payerName: 'Pat Contractor',
  anomaly: 'amount_mismatch',
}

const onePage = { total: 1, offset: 0, prevOffset: null, nextOffset: null }

function render(overview: Partial<Parameters<typeof PaymentAlerts>[0]['overview']>) {
  return renderToStaticMarkup(
    <PaymentAlerts
      overview={{
        unknownAttempts: [attempt as Attempt],
        anomalies: [attempt as Attempt],
        overpayments: [],
        flaggedPages: { unknown: onePage, anomalies: onePage },
        ...overview,
      }}
      params={new Map([['range', ['week']]])}
    />,
  )
}

describe('payment alerts', () => {
  it('gives the unknown-outcome and anomaly lists the anchors Today links to', () => {
    const html = render({})
    expect(html).toContain(`id="${PAYMENT_ALERT_IDS.unknown}"`)
    expect(html).toContain(`id="${PAYMENT_ALERT_IDS.anomalies}"`)
    expect(html).not.toContain('Next page')
  })

  it('shows the full count and a link to the next page when more are flagged than one page holds', () => {
    const html = render({
      unknownAttempts: Array.from(
        { length: 50 },
        (_, i) => ({ ...attempt, id: `u${i}` }) as Attempt,
      ),
      flaggedPages: {
        unknown: { total: 54, offset: 0, prevOffset: null, nextOffset: 50 },
        anomalies: onePage,
      },
    })
    expect(html).toContain('1-50 of 54')
    expect(html).toContain(
      `href="/staff/payments?range=week&amp;unknownAt=50#${PAYMENT_ALERT_IDS.unknown}"`,
    )
  })
})
