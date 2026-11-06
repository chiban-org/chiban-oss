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

describe('payment alerts', () => {
  it('gives the unknown-outcome and anomaly lists the anchors Today links to', () => {
    const html = renderToStaticMarkup(
      <PaymentAlerts
        overview={{
          unknownAttempts: [attempt as Attempt],
          anomalies: [attempt as Attempt],
          overpayments: [],
        }}
      />,
    )
    expect(html).toContain(`id="${PAYMENT_ALERT_IDS.unknown}"`)
    expect(html).toContain(`id="${PAYMENT_ALERT_IDS.anomalies}"`)
  })
})
