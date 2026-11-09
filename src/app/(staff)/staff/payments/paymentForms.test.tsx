// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ApplicationPayments } from '@/features/payments/applicationPayments'
import { expectRefusalBeside } from '@/test/besideField'

const refusal = vi.hoisted(() => ({ field: '', message: '' }))
const answer = vi.hoisted(
  () => () =>
    Promise.resolve({
      ok: false as const,
      error: refusal.message,
      fieldErrors: { [refusal.field]: refusal.message },
    }),
)

vi.mock('@/app/(staff)/staff/payments/actions', () => ({
  refundAction: answer,
  returnedCheckAction: answer,
  chargebackAction: answer,
  correctAction: answer,
  recordPaymentAction: answer,
}))
vi.mock('@/app/(staff)/staff/payments/cardActions', () => ({ startCardAction: answer }))
vi.mock('@/app/(staff)/staff/counter/readerActions', () => ({
  readerAction: answer,
  checkAction: answer,
  reconnectAction: answer,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { EntryControls, RecordPaymentForm } = await import(
  '../applications/[applicationId]/paymentControls'
)

afterEach(cleanup)

function renderIn(node: ReactNode) {
  render(<CsrfProvider token="t">{node}</CsrfProvider>)
}

function refuseWith(field: string, message: string) {
  refusal.field = field
  refusal.message = message
}

const payments = (overrides: Partial<ApplicationPayments> = {}): ApplicationPayments => ({
  applicationId: '4b0a8e1c-0c35-4f0c-9d57-5a0f6a3a7b11',
  balance: { dueCents: 4500, lines: [] } as unknown as ApplicationPayments['balance'],
  entries: [],
  canRefund: true,
  canCollect: true,
  targets: [{ id: '9a1c2f3d-6b7e-4a58-8c19-0d2e3f4a5b6c', number: 'BP-2026-0002' }],
  card: { reader: { available: true, simulated: false }, feeCents: 135, openAttempt: null },
  ...overrides,
})

const entry = (method: string): ApplicationPayments['entries'][number] => ({
  id: '7c3d1e2f-5a6b-4c8d-9e0f-1a2b3c4d5e6f',
  entryType: 'payment',
  method,
  amountCents: 4500,
  payerName: 'Pat Contractor',
  businessDate: '2026-11-01',
  checkNumber: method === 'check' ? '1042' : null,
  receiptId: null,
  receiptNumber: null,
  refundable: [{ label: 'Electrical permit', cents: 4500 }] as never,
})

function formOf(submit: string): HTMLElement {
  return screen.getByRole('button', { name: submit }).closest('form') as HTMLElement
}

async function refused(submit: string, label: string, field: string, message: string) {
  refuseWith(field, message)
  const form = formOf(submit)
  for (const input of form.querySelectorAll<HTMLInputElement>('input:not([type=hidden])')) {
    fireEvent.change(input, { target: { value: input.type === 'date' ? '2026-11-01' : '10.00' } })
  }
  fireEvent.click(within(form).getByRole('button', { name: submit }))
  await expectRefusalBeside(within(form).getByLabelText(new RegExp(`^${label}`)), message)
}

describe('payment forms on an application', () => {
  it('shows a refused refund amount beside the amount field', async () => {
    renderIn(<EntryControls entry={entry('cash')} payments={payments()} />)
    await refused(
      'Refund',
      'Refund amount in dollars',
      'amount',
      'Enter the refund amount in dollars and cents, like 25.00.',
    )
  })

  it('shows a refused returned date beside the date field', async () => {
    renderIn(<EntryControls entry={entry('check')} payments={payments()} />)
    await refused(
      'Record returned check',
      'Returned on',
      'returnedOn',
      'Enter the date returned between January 1, 1900 and November 6, 2026.',
    )
  })

  it('shows a refused dispute reference beside the reference field', async () => {
    renderIn(<EntryControls entry={entry('card_online')} payments={payments()} />)
    await refused(
      'Record chargeback',
      'Dispute reference',
      'disputeRef',
      'Enter the dispute reference.',
    )
  })

  it('shows a refused move amount beside the amount field', async () => {
    renderIn(<EntryControls entry={entry('cash')} payments={payments()} />)
    await refused(
      'Move to another permit',
      'Amount in dollars',
      'amount',
      'No fee line on that application can take this amount.',
    )
  })

  it('shows a refused payer name beside the payer field', async () => {
    renderIn(<RecordPaymentForm payments={payments()} />)
    await refused('Record payment', 'Payer name', 'payerName', 'Enter the payer name.')
  })

  it('offers card at the counter with the charge, card fee included, when a reader is set up', () => {
    renderIn(<RecordPaymentForm payments={payments()} />)
    const card = screen.getByRole('group', { name: 'Card at the counter' })
    expect(
      within(card).getByText('The reader charges $46.35: $45.00 due plus a $1.35 card fee.'),
    ).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Start card payment' })).toBeTruthy()
  })

  it('hides card at the counter and says why in one line when no reader is set up', () => {
    const reason =
      'Card at the counter is off because no card reader device is set up in Payment settings.'
    renderIn(
      <RecordPaymentForm
        payments={payments({
          card: { reader: { available: false, reason }, feeCents: 0, openAttempt: null },
        })}
      />,
    )
    expect(screen.queryByRole('group', { name: 'Card at the counter' })).toBeNull()
    expect(screen.getByText(reason)).toBeTruthy()
  })
})
