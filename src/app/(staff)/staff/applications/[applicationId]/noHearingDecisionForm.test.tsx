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

const LAST_APPROVAL = 'This is the last municipal approval the project needs'

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
      offerFinalApproval: false,
    })
    fireEvent.click(screen.getByText('Record a decision without a hearing'))
    expect(screen.getByRole('option', { name: 'April 14, 2027' })).toBeTruthy()
    expect(screen.getByLabelText(/^Findings of fact/)).toBeTruthy()
    expect(screen.queryByLabelText(LAST_APPROVAL)).toBeNull()
  })

  it('asks whether this is the last approval when the pack waits for one', () => {
    renderPanel({
      meetings: [{ id: 'm1', text: 'April 14, 2027' }],
      seatedMembers: ['Avery Stone'],
      today: '2027-04-20',
      offerFinalApproval: true,
    })
    fireEvent.click(screen.getByText('Record a decision without a hearing'))
    expect(screen.getByRole('checkbox', { name: LAST_APPROVAL })).toBeTruthy()
  })

  it('offers nothing when the classification needs a hearing', () => {
    renderPanel(null)
    expect(screen.queryByText('Record a decision without a hearing')).toBeNull()
  })
})
