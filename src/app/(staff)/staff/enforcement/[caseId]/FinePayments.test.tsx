// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CasePaymentEntry } from '@/features/payments/casePayments'
import { ALL_CAN, openSection, renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../moneyActions', () => ({ fineAction: vi.fn(), finePaymentAction: vi.fn() }))
vi.mock('@/app/(staff)/staff/payments/actions', () => ({
  refundAction: vi.fn(),
  returnedCheckAction: vi.fn(),
  chargebackAction: vi.fn(),
}))

const { MoneySection } = await import('./MoneySection')

afterEach(cleanup)

const FINE_ID = '3f2a1b0c-4d5e-4f60-8a71-92b3c4d5e6f7'
const ENTRY_ID = '7c3d1e2f-5a6b-4c8d-9e0f-1a2b3c4d5e6f'

const entry = (overrides: Partial<CasePaymentEntry> = {}): CasePaymentEntry => ({
  id: ENTRY_ID,
  entryType: 'payment',
  method: 'check',
  amountCents: 5000,
  payerName: 'Pat Owner',
  businessDate: '2027-07-10',
  checkNumber: '2201',
  receiptId: 'r1',
  receiptNumber: 'R-2027-0004',
  paymentAttemptId: null,
  refundableCents: 5000,
  ...overrides,
})

function detailWith(entries: CasePaymentEntry[], canRefund: boolean) {
  return stubDetail({
    fines: [
      {
        row: {
          id: FINE_ID,
          kind: 'civil_penalty',
          amountCents: 20000,
          imposedOn: '2027-07-01',
          court: 'District Court',
          docket: '2027-CV-1',
        },
        dueCents: 15000,
        paidCents: 5000,
      },
    ],
    payments: { canRefund, byFine: new Map([[FINE_ID, entries]]) },
  })
}

describe('payments recorded on a fine', () => {
  it('lists each payment with its receipt', () => {
    renderForm(<MoneySection detail={detailWith([entry()], false)} can={ALL_CAN} />)
    expect(screen.getByText(/check 2201: \$50\.00 from Pat Owner/)).toBeDefined()
    expect(screen.getByRole('link', { name: 'Receipt R-2027-0004' })).toHaveProperty(
      'href',
      expect.stringContaining('/staff/receipts/r1'),
    )
    expect(screen.queryByText('Refund or reverse')).toBeNull()
  })

  it('offers refund and returned check for a check, scoped to this fine', () => {
    const { container } = renderForm(
      <MoneySection detail={detailWith([entry()], true)} can={ALL_CAN} />,
    )
    openSection('Refund or reverse')
    const refund = screen.getByRole('button', { name: 'Refund' }).closest('form') as HTMLElement
    expect(refund.querySelector('input[name=fineId]')).toHaveProperty('value', FINE_ID)
    expect(refund.querySelector('input[name=applicationId]')).toBeNull()
    expect(within(refund).getByText('Civil penalty, up to $50.00')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Record returned check' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Record chargeback' })).toBeNull()
    expect(container.textContent).not.toContain('Move to another permit')
  })

  it('offers a chargeback for a card payment and links to the card payment', () => {
    renderForm(
      <MoneySection
        detail={detailWith([entry({ method: 'card_present', paymentAttemptId: 'a1' })], true)}
        can={ALL_CAN}
      />,
    )
    expect(screen.getByRole('link', { name: 'Card payment' })).toHaveProperty(
      'href',
      expect.stringContaining('/staff/payments/a1'),
    )
    openSection('Refund or reverse')
    expect(screen.getByRole('button', { name: 'Record chargeback' })).toBeDefined()
  })

  it('has no reversal controls on a refund row', () => {
    renderForm(
      <MoneySection
        detail={detailWith([entry({ entryType: 'refund', amountCents: -1000 })], true)}
        can={ALL_CAN}
      />,
    )
    expect(screen.queryByText('Refund or reverse')).toBeNull()
  })
})
