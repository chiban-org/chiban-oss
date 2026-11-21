// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { BoardPanelData } from '@/features/boards/panelData'
import type { ReceiptPanel } from '@/features/boards/receiptPanel'

vi.mock('../../boards/actions', () => ({}))
vi.mock('./boardPanelSections', () => ({
  CostSection: () => null,
  DeterminationSection: () => null,
  ListSection: () => null,
}))
vi.mock('./boardDecisionSection', () => ({ DecisionSection: () => null }))
vi.mock('./boardForms', () => ({ MeetingForm: () => null, VoteFormBody: () => null }))
vi.mock('./receiptSection', () => ({ ReceiptSection: () => <h3>Notices on receipt</h3> }))

const { BoardPanel } = await import('./boardPanel')

afterEach(cleanup)

function data(receipt: ReceiptPanel | null): BoardPanelData {
  return {
    applicationId: 'a1',
    boardKind: 'planning_board',
    boardName: 'Planning Board',
    missingBoard: null,
    state: 'under_review',
    canRecord: false,
    acceptanceText: null,
    acceptanceMeetingId: null,
    hasFilingLead: false,
    today: '2027-03-02',
    receipt,
  } as unknown as BoardPanelData
}

function show(receipt: ReceiptPanel | null) {
  render(
    <CsrfProvider token="t">
      <BoardPanel data={data(receipt)} hearings={[]} />
    </CsrfProvider>,
  )
}

describe('the receipt notices section on the board panel', () => {
  it('is absent when the classification has no on_receipt requirement', () => {
    show(null)
    expect(screen.queryByText('Notices on receipt')).toBeNull()
  })

  it('is present when the classification has one', () => {
    show({} as ReceiptPanel)
    expect(screen.getByText('Notices on receipt')).toBeTruthy()
  })
})
