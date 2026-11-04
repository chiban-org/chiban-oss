// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { MeetingView } from '@/features/hearings/meetingView'

vi.mock('../../hearings/actions', () => ({
  addAgendaItemAction: vi.fn(),
  buildAgendaAction: vi.fn(),
  createMeetingPacketAction: vi.fn(),
  moveAgendaItemAction: vi.fn(),
  publishAgendaAction: vi.fn(),
  removeAgendaItemAction: vi.fn(),
  reopenAgendaAction: vi.fn(),
}))

const { MeetingRail } = await import('./MeetingRail')

afterEach(cleanup)

const HEARING = { id: 'h1', text: 'SPR-2026-0001', statusText: 'Scheduled', status: 'scheduled' }

function emptyMeeting(hearings: (typeof HEARING)[]): MeetingView {
  return {
    meetingId: 'm1',
    cancelled: false,
    past: false,
    cancelReason: null,
    kindText: 'Regular meeting',
    locationText: '',
    hearings,
    agenda: null,
    packetId: null,
    canManagePackets: true,
  } as unknown as MeetingView
}

function renderRail(v: MeetingView) {
  render(
    <CsrfProvider token="t">
      <MeetingRail view={v} />
    </CsrfProvider>,
  )
}

describe('meeting rail next step', () => {
  it('starts the agenda from the scheduled hearings when there are any', () => {
    renderRail(emptyMeeting([HEARING]))
    expect(screen.getByRole('button', { name: 'Add the scheduled hearings' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Build the agenda' })).toBeNull()
  })

  it('opens the add item form when no hearings are scheduled', () => {
    renderRail(emptyMeeting([]))
    expect(screen.getByRole('textbox', { name: 'Title' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add the first agenda item' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Build the agenda' })).toBeNull()
  })
  it('offers no next step for a meeting that has already taken place', () => {
    renderRail({ ...emptyMeeting([HEARING]), past: true })
    expect(screen.queryByRole('button', { name: 'Add the scheduled hearings' })).toBeNull()
    expect(screen.queryByText('Next step')).toBeNull()
  })
})
