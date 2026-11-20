// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { DeliveryGroupView } from '@/features/decisions/deliveryView'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../../hearings/decisionActions', () => ({ recordDeliveryAction: vi.fn() }))

const { DeliverySection } = await import('./DeliverySection')
const { recordDeliveryAction } = await import('../../hearings/decisionActions')

afterEach(cleanup)

const groups: DeliveryGroupView[] = [
  {
    key: 'g1',
    source: 'decision',
    title: 'Board decision, voted April 15, 2027',
    dueText: 'April 22, 2027',
    methods: [
      { value: 'mail', label: 'Mailed' },
      { value: 'hand', label: 'Hand delivered' },
    ],
    rows: [
      { id: 'r1', roleLabel: 'Applicant', name: 'Pat Applicant', delivered: null },
      { id: 'r2', roleLabel: 'Agent', name: 'Pat Agent', delivered: 'Mailed April 17, 2027' },
    ],
  },
]

function renderSection() {
  return render(
    <CsrfProvider token="t">
      <DeliverySection groups={groups} today="2027-04-20" />
    </CsrfProvider>,
  )
}

describe('delivery of a board decision', () => {
  it('lists each recipient and offers a form only for one not yet delivered', () => {
    renderSection()
    expect(screen.getByText('Due April 22, 2027.')).toBeTruthy()
    expect(screen.getByText('Applicant: Pat Applicant')).toBeTruthy()
    expect(screen.getByText('Mailed April 17, 2027')).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('shows a refused date beside the Date delivered field', async () => {
    vi.mocked(recordDeliveryAction).mockResolvedValue(
      refusal('deliveredOn', 'The decision cannot be filed before the date of the vote.'),
    )
    renderSection()
    fireEvent.change(screen.getByLabelText(/^How it was delivered( \*)?$/), {
      target: { value: 'hand' },
    })
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'Record delivery to Pat Applicant' }),
      () => screen.getByLabelText(/^Date delivered( \*)?$/),
      'The decision cannot be filed before the date of the vote.',
    )
  })
})
