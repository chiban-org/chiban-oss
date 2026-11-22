// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { PlanActionKind } from '@/features/applications/workPlanTypes'
import type { BoardPanelData } from '@/features/boards/panelData'

vi.mock('../../boards/actions', () => ({}))
vi.mock('./boardPanelSections', () => ({
  CostSection: () => null,
  DeterminationSection: () => null,
  ListSection: () => null,
}))
vi.mock('./boardDecisionSection', () => ({ DecisionSection: () => null }))
vi.mock('./boardForms', () => ({
  MeetingForm: () => <p>Two step meeting form</p>,
  ScheduleHearingForm: () => <p>Single step hearing form</p>,
  VoteFormBody: () => <p>Two step vote form</p>,
}))
vi.mock('./receiptSection', () => ({ ReceiptSection: () => null }))

const { BoardPanel } = await import('./boardPanel')

afterEach(cleanup)

function legacyAppeal(boardKind: string): BoardPanelData {
  return {
    applicationId: 'a1',
    boardKind,
    boardName: 'Fernhollow Board of Appeals',
    missingBoard: null,
    state: 'submitted',
    canRecord: true,
    acceptanceText: 'November 17, 2026',
    acceptanceMeetingId: 'm1',
    acceptanceDate: '2026-11-17',
    hasFilingLead: false,
    today: '2026-11-20',
    receipt: null,
  } as unknown as BoardPanelData
}

function show(data: BoardPanelData, hosted: PlanActionKind[] = ['set_board_meeting']) {
  render(
    <CsrfProvider token="t">
      <BoardPanel data={data} hearings={[]} hosted={new Set(hosted)} />
    </CsrfProvider>,
  )
}

describe('the board panel on an appeals application with a meeting set the old way', () => {
  it('offers neither the old meeting form nor the open the hearing vote', () => {
    show(legacyAppeal('zba'))
    expect(screen.queryByText('Two step vote form')).toBeNull()
    expect(screen.queryByText('Open the hearing')).toBeNull()
    expect(screen.queryByText('Two step meeting form')).toBeNull()
  })

  it('agrees with the hearings panel that no hearing is scheduled', () => {
    show(legacyAppeal('zba'))
    expect(screen.getByText('No hearing is scheduled.')).toBeTruthy()
    expect(screen.queryByText(/Hearing meeting: November 17, 2026/)).toBeNull()
  })

  it('offers the single step form when the plan does not host it', () => {
    show(legacyAppeal('zba'), [])
    expect(screen.queryByText('Two step meeting form')).toBeNull()
    expect(screen.getByText('Single step hearing form')).toBeTruthy()
  })

  it('keeps the completeness vote for a planning board', () => {
    show(legacyAppeal('planning_board'))
    expect(screen.getByText('Two step vote form')).toBeTruthy()
  })
})
