// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { MeetingMinutesView } from '@/features/boards/minutesView'
import type { MeetingView } from '@/features/hearings/meetingView'

vi.mock('../../hearings/actions', () => ({
  addAgendaItemAction: vi.fn(),
  buildAgendaAction: vi.fn(),
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

function renderRail(
  v: MeetingView,
  packetStep: 'prepare' | 'update' | null = null,
  minutes: MeetingMinutesView | null = null,
) {
  render(
    <CsrfProvider token="t">
      <MeetingRail view={v} packetStep={packetStep} minutes={minutes} />
    </CsrfProvider>,
  )
}

const NO_MINUTES: MeetingMinutesView = {
  held: true,
  today: '2027-05-02',
  current: null,
  choices: [],
}
const APPROVED: MeetingMinutesView = {
  held: true,
  today: '2027-05-02',
  current: { documentId: 'd1', title: 'Minutes', status: 'approved', approvedText: 'May 1, 2027' },
  choices: [],
}

function published(): MeetingView {
  return {
    ...emptyMeeting([HEARING]),
    agenda: { status: 'published', items: [{ id: 'i1' }] },
  } as unknown as MeetingView
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

  it('asks for the minutes of a held meeting until approved minutes are recorded', () => {
    renderRail({ ...emptyMeeting([HEARING]), past: true }, null, NO_MINUTES)
    expect(screen.getByRole('link', { name: 'Record the minutes' }).getAttribute('href')).toBe(
      '#minutes',
    )
    expect(screen.getByText('Not attached yet')).toBeTruthy()
    cleanup()
    renderRail({ ...emptyMeeting([HEARING]), past: true }, null, APPROVED)
    expect(screen.queryByText('Next step')).toBeNull()
    expect(screen.getByText('Approved May 1, 2027. Public.')).toBeTruthy()
  })

  it('jumps to the packet section once the agenda is published', () => {
    renderRail(published(), 'prepare')
    const link = screen.getByRole('link', { name: 'Prepare the packet' })
    expect(link.getAttribute('href')).toBe('#packet')
  })

  it('jumps to the update when changes are not sent yet, and offers nothing once sent', () => {
    renderRail(published(), 'update')
    expect(screen.getByRole('link', { name: 'Send the packet update' })).toBeTruthy()
    cleanup()
    renderRail(published(), null)
    expect(screen.queryByText('Next step')).toBeNull()
  })

  it('names the public pages the agenda will show on', () => {
    renderRail({
      ...emptyMeeting([HEARING]),
      agenda: { status: 'draft', items: [{ id: 'i1' }] },
    } as unknown as MeetingView)
    expect(screen.getByRole('button', { name: 'Show the agenda on the public site' })).toBeTruthy()
    expect(
      screen.getByText(
        'The agenda then shows on the board page and the meetings page of the public site.',
      ),
    ).toBeTruthy()
  })
})
