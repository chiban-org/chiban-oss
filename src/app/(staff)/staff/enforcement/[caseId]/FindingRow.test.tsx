// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findingUses } from '@/features/enforcement/findingUses'
import { renderForm, stubDetail } from '@/test/enforcementRender'

vi.mock('../findingFixActions', () => ({
  editFindingAction: vi.fn(),
  markFindingCorrectedAction: vi.fn(),
  withdrawFindingAction: vi.fn(),
}))

const { FindingRow } = await import('./FindingRow')

afterEach(cleanup)

const base = {
  id: 'f1',
  provisionKind: 'zoning_ordinance',
  provisionRef: 'Section 4.2',
  facts: 'A shed.',
  status: 'open',
  inspectionDate: '2027-07-01',
  foundBy: 'u1',
  withdrawnBy: null,
  withdrawnReason: null,
  correctedOn: null,
  correctedNote: null,
}

function row(finding: Record<string, unknown>, notices: unknown[] = [], manage = true) {
  const detail = stubDetail({ findings: [finding], notices, names: { u1: 'Sam Clerk' } })
  const f = detail.findings[0]
  if (f === undefined) throw new Error('no finding')
  renderForm(
    <ul>
      <FindingRow finding={f} detail={detail} uses={findingUses(detail)} manage={manage} />
    </ul>,
  )
  return screen.getByRole('listitem')
}

describe('a finding row', () => {
  it('offers Edit, and Mark corrected and Withdraw behind More, for an open finding', () => {
    const item = row(base)
    expect(within(item).getByRole('button', { name: 'Edit Zoning ordinance: Section 4.2' }))
    expect(within(item).getByText('More', { selector: 'summary' }))
    expect(within(item).getByRole('button', { name: 'Withdraw Zoning ordinance: Section 4.2' }))
    expect(
      within(item).getByRole('button', { name: 'Mark Zoning ordinance: Section 4.2 corrected' }),
    )
  })

  it('leaves out Edit once a notice includes the finding and says where it appears', () => {
    const item = row(base, [{ findingIds: ['f1'], sentOn: '2027-07-03' }])
    expect(within(item).queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(within(item).getByText('In the notice sent July 3, 2027.')).toBeTruthy()
  })

  it('shows a withdrawn finding struck through with its chip and reason and no actions', () => {
    const item = row({
      ...base,
      status: 'withdrawn',
      withdrawnBy: 'u1',
      withdrawnReason: 'Recorded on the wrong lot.',
    })
    expect(within(item).getByText('Zoning ordinance: Section 4.2').className).toContain(
      'line-through',
    )
    expect(within(item).getByText('Withdrawn')).toBeTruthy()
    expect(
      within(item).getByText('Withdrawn by Sam Clerk: Recorded on the wrong lot.'),
    ).toBeTruthy()
    expect(within(item).queryByText('More')).toBeNull()
  })

  it('shows the corrected chip with the date and note', () => {
    const item = row({
      ...base,
      status: 'corrected',
      correctedOn: '2027-07-10',
      correctedNote: 'Moved.',
    })
    expect(within(item).getByText('Corrected')).toBeTruthy()
    expect(within(item).getByText('Corrected July 10, 2027. Moved.')).toBeTruthy()
  })

  it('offers no actions to someone who cannot manage the case', () => {
    const item = row(base, [], false)
    expect(within(item).queryByRole('button')).toBeNull()
  })
})
