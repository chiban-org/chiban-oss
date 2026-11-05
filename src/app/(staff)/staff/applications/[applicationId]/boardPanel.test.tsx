// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { BoardPanelData } from '@/features/boards/panelData'

vi.mock('../../boards/actions', () => ({ completenessVoteAction: vi.fn() }))
vi.mock('./boardPanelSections', () => ({}))
vi.mock('./boardDecisionSection', () => ({}))

const { VoteForm } = await import('./boardPanel')

afterEach(cleanup)

function data(acceptanceDate: string): BoardPanelData {
  return {
    applicationId: 'a1',
    board: 'planning_board',
    acceptanceMeetingId: 'm1',
    acceptanceDate,
    acceptanceText: 'November 25, 2026',
    today: '2026-11-02',
  } as unknown as BoardPanelData
}

describe('completeness vote form', () => {
  it('offers no vote form before the meeting has happened', () => {
    render(
      <CsrfProvider token="t">
        <VoteForm data={data('2026-11-25')} />
      </CsrfProvider>,
    )
    expect(screen.queryByLabelText(/^Date\ of\ the\ vote( \*)?$/)).toBeNull()
    expect(screen.getByText(/once the meeting on November 25, 2026 has happened/)).toBeTruthy()
  })

  it('limits the vote date to the meeting through today once the meeting is past', () => {
    render(
      <CsrfProvider token="t">
        <VoteForm data={data('2026-10-28')} />
      </CsrfProvider>,
    )
    const input = screen.getByLabelText(/^Date\ of\ the\ vote( \*)?$/)
    expect(input.getAttribute('min')).toBe('2026-10-28')
    expect(input.getAttribute('max')).toBe('2026-11-02')
  })
})
