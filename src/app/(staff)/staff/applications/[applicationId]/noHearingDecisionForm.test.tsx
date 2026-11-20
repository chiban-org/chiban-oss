// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { ApplicationHearingsPanel } from '@/features/hearings/applicationPanel'

vi.mock('../../boards/hearings/actions', () => ({
  scheduleHearingAction: vi.fn(),
  routeToTrcAction: vi.fn(),
}))
vi.mock('../../boards/hearings/decisionActions', () => ({
  recordDecisionWithoutHearingAction: vi.fn(),
}))

const { HearingsPanel } = await import('./hearingsPanel')

afterEach(cleanup)

const base = {
  applicationId: 'a1',
  hearings: [],
  decisions: [],
  trc: [],
  canSchedule: false,
  canRoute: false,
  scheduleMeetings: [],
  scheduleKinds: [],
}

function renderPanel(noHearing: ApplicationHearingsPanel['noHearing']) {
  render(
    <CsrfProvider token="t">
      <HearingsPanel data={{ ...base, noHearing } as unknown as ApplicationHearingsPanel} />
    </CsrfProvider>,
  )
}

describe('recording a decision without a hearing', () => {
  it('offers the form with the past meetings of the board', () => {
    renderPanel({
      meetings: [{ id: 'm1', text: 'April 14, 2027' }],
      seatedMembers: ['Avery Stone'],
      today: '2027-04-20',
    })
    fireEvent.click(screen.getByText('Record a decision without a hearing'))
    expect(screen.getByRole('option', { name: 'April 14, 2027' })).toBeTruthy()
    expect(screen.getByLabelText(/^Findings of fact/)).toBeTruthy()
  })

  it('offers nothing when the classification needs a hearing', () => {
    renderPanel(null)
    expect(screen.queryByText('Record a decision without a hearing')).toBeNull()
  })
})
