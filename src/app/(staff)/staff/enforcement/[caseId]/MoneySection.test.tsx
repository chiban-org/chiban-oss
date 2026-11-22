// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expectRefusalBeside, refusal } from '@/test/besideField'
import {
  ALL_CAN,
  fillField,
  labelled,
  openSection,
  renderForm,
  stubDetail,
} from '@/test/enforcementRender'

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
    openSection('Record a payment')
    const [amount] = screen.getAllByLabelText(labelled('Amount in dollars'))
    fireEvent.change(amount as HTMLElement, { target: { value: '10' } })
    fillField(labelled('Payer name'), 'Pat Owner')
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
    await expectRefusalBeside(screen.getByLabelText(labelled('Check number')), message)
  })
})

describe('the payment form', () => {
  it('folds behind Record a payment unless paying is the step in Do this now', () => {
    const { container } = renderForm(<MoneySection detail={detail} can={ALL_CAN} />)
    const fine = container.querySelector('article')
    const payment = fine?.querySelector('details')
    expect(payment?.querySelector('summary')?.textContent).toBe('Record a payment')
    expect(payment?.hasAttribute('open')).toBe(false)
    expect(payment?.querySelector('button')?.textContent).toContain('Record payment')
  })
})

describe('the penalty exposure', () => {
  const rangeExposure = (fromDate: string | null, days: number) => ({
    kind: 'range' as const,
    fromDate,
    days,
    label: 'Statutory range, set by the court',
    categories: [{ key: 'a', label: 'No permit', minCentsPerDay: 10000, maxCentsPerDay: 250000 }],
    aggravations: [
      { key: 'b', label: 'Prior conviction within 2 years', maxCentsPerDay: 50000 },
      { key: 'c', label: 'Economic benefit', maxMultipleOfBenefit: 2 },
    ],
  })
  const range = stubDetail({ exposure: rangeExposure('2027-03-05', 10) })

  it('renders the statutory range and no estimate', () => {
    renderForm(<MoneySection detail={range} can={ALL_CAN} />)
    expect(screen.getByText('Statutory range, set by the court')).toBeTruthy()
    expect(screen.getByText('No permit: $100.00 to $2,500.00 per day')).toBeTruthy()
    expect(screen.getByText('Prior conviction within 2 years: up to $500.00 per day')).toBeTruthy()
    expect(screen.getByText('Economic benefit: up to 2 times the economic benefit')).toBeTruthy()
    expect(screen.queryByText(/estimated \$/)).toBeNull()
  })

  it('ends the accrual line of a range with one period, started or not', () => {
    renderForm(<MoneySection detail={range} can={ALL_CAN} />)
    expect(screen.getByText('Accrual began March 5, 2027. 10 days.')).toBeTruthy()
    cleanup()
    const notStarted = stubDetail({ exposure: rangeExposure(null, 0) })
    renderForm(<MoneySection detail={notStarted} can={ALL_CAN} />)
    expect(
      screen.getByText(
        'Accrual has not started: no written notice has been received and no conviction has been recorded.',
      ),
    ).toBeTruthy()
  })

  it('says no accrual start is recorded for a range with no accrual rule', () => {
    const noRule = stubDetail({ exposure: { ...rangeExposure(null, 0), noAccrualRule: true } })
    renderForm(<MoneySection detail={noRule} can={ALL_CAN} />)
    expect(screen.getByText('No accrual start is recorded for this penalty.')).toBeTruthy()
    expect(screen.queryByText(/Accrual has not started/)).toBeNull()
  })

  it('renders a computed estimate for a fixed daily rule', () => {
    const fixed = stubDetail({
      exposure: {
        kind: 'computed',
        fromDate: '2027-02-10',
        days: 10,
        cents: 275000,
        label:
          'Estimated statutory exposure for counsel. Nothing is owed unless a court imposes it.',
      },
    })
    renderForm(<MoneySection detail={fixed} can={ALL_CAN} />)
    expect(
      screen.getByText('Accrual began February 10, 2027. 10 days, estimated $2,750.00.'),
    ).toBeTruthy()
  })
})

describe('a judgment seen by staff who cannot record fines', () => {
  const sentence =
    'A judgment for the town is recorded. Finance or an administrator records the fine here.'

  it('says who records the fine', () => {
    renderForm(<MoneySection detail={detail} can={{ ...ALL_CAN, fine: false }} />)
    expect(screen.getByText(sentence)).toBeTruthy()
    expect(screen.queryByText('Record a court-imposed fine')).toBeNull()
  })

  it('stays quiet for staff who can record the fine', () => {
    renderForm(<MoneySection detail={detail} can={ALL_CAN} />)
    expect(screen.queryByText(sentence)).toBeNull()
  })
})
