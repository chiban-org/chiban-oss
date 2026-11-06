import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import type { FeeRow } from '@/features/fees/feeRows'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'

vi.mock('@/app/(staff)/staff/payments/actions', () => ({}))
vi.mock('./clockFeeActions', () => ({}))

const { FeesPaymentsPanel } = await import('./feesPaymentsPanel')

const PREVIEW: FeeRow = {
  key: 'preview-BP',
  label: 'Building permit fee',
  stageText: 'Next assessment, not yet due',
  assessedText: '$40.00',
  paidCents: null,
  dueCents: null,
  explanation: [],
  preview: true,
}

const PAYMENTS = {
  applicationId: 'a1',
  balance: { dueCents: 0, unknownAttempts: 0, pendingAttempts: 0, lines: [] },
  entries: [],
  canCollect: false,
  canRefund: false,
  targets: [],
} as unknown as ApplicationPayments

describe('the fees and payments panel', () => {
  it('reads a fee that is not assessed yet as not yet due instead of not assessed', () => {
    const html = renderToStaticMarkup(
      <FeesPaymentsPanel
        view={{ permissions: { canOverrideFee: false } } as unknown as StaffApplicationView}
        payments={PAYMENTS}
        rows={[PREVIEW]}
      />,
    )
    expect(html.match(/Not yet due/g)).toHaveLength(2)
    expect(html).not.toContain('Not assessed')
  })
})
