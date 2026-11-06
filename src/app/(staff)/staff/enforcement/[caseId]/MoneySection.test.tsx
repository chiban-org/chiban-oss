// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, it, vi } from 'vitest'
import { expectRefusalBeside } from '@/test/besideField'
import {
  ALL_CAN,
  fillField,
  labelled,
  openSection,
  renderForm,
  stubDetail,
} from '@/test/enforcementRender'
import { refusal } from '@/test/refusalBeside'

vi.mock('../moneyActions', () => ({ fineAction: vi.fn(), finePaymentAction: vi.fn() }))

const { MoneySection } = await import('./MoneySection')
const { fineAction, finePaymentAction } = await import('../moneyActions')

afterEach(cleanup)

const detail = stubDetail({
  orders: [
    {
      row: { id: 'o1', number: 'CD-2027-0001' },
      steps: [
        { id: 's1', kind: 'judgment', judgmentOutcome: 'affirmed', occurredOn: '2027-06-18' },
      ],
    },
  ],
  fines: [
    {
      row: {
        id: 'fine1',
        kind: 'civil_penalty',
        amountCents: 20000,
        imposedOn: '2027-07-01',
        court: 'District Court',
        docket: '2027-CV-1',
      },
      dueCents: 20000,
      paidCents: 0,
    },
  ],
})

describe('recording a fine', () => {
  it('shows a refused basis beside the basis field', async () => {
    const message = 'A fine needs a recorded court judgment for this case.'
    vi.mocked(fineAction).mockResolvedValue(refusal('basis', message))
    renderForm(<MoneySection detail={detail} can={ALL_CAN} />)
    openSection('Record a court-imposed fine')
    for (const amount of screen.getAllByLabelText(labelled('Amount in dollars'))) {
      fireEvent.change(amount, { target: { value: '500' } })
    }
    fillField(labelled('Court'), 'District Court')
    fillField(labelled('Docket number'), '2027-CV-1')
    fireEvent.click(screen.getByRole('button', { name: 'Record fine' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Based on')), message)
  })

  it('shows a refused amount beside the amount field', async () => {
    const message = 'Enter the amount from $0.01 to $10,000,000.00.'
    vi.mocked(fineAction).mockResolvedValue(refusal('dollars', message))
    renderForm(<MoneySection detail={detail} can={ALL_CAN} />)
    openSection('Record a court-imposed fine')
    const amounts = screen.getAllByLabelText(labelled('Amount in dollars'))
    for (const amount of amounts) fireEvent.change(amount, { target: { value: '500' } })
    fillField(labelled('Court'), 'District Court')
    fillField(labelled('Docket number'), '2027-CV-1')
    fireEvent.click(screen.getByRole('button', { name: 'Record fine' }))
    await expectRefusalBeside(amounts.at(-1) as HTMLElement, message)
  })
})

describe('recording a payment on a fine', () => {
  it('shows a refused check number beside the check number field', async () => {
    const message = 'Enter the check number.'
    vi.mocked(finePaymentAction).mockResolvedValue(refusal('checkNumber', message))
    renderForm(<MoneySection detail={detail} can={ALL_CAN} />)
    const [amount] = screen.getAllByLabelText(labelled('Amount in dollars'))
    fireEvent.change(amount as HTMLElement, { target: { value: '10' } })
    fillField(labelled('Payer name'), 'Pat Owner')
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Check number')), message)
  })
})
