// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { MeetingView } from '@/features/hearings/meetingView'

vi.mock('../../hearings/actions', () => ({
  addAgendaItemAction: vi.fn(),
  buildAgendaAction: vi.fn(),
  moveAgendaItemAction: vi.fn(),
  removeAgendaItemAction: vi.fn(),
  reopenAgendaAction: vi.fn(),
}))

const { AgendaSection } = await import('./AgendaSection')

afterEach(cleanup)

function view(cancelled: boolean, status: 'draft' | 'published'): MeetingView {
  return {
    meetingId: 'm1',
    cancelled,
    agenda: {
      status,
      revision: 1,
      publishedText: null,
      documentId: null,
      items: [
        {
          id: 'i1',
          position: 0,
          text: 'Approve the March minutes',
          line: 'Minutes: Approve the March minutes',
          description: '',
          kindText: 'Minutes',
        },
      ],
    },
  } as unknown as MeetingView
}

function renderSection(v: MeetingView) {
  render(
    <CsrfProvider token="t">
      <AgendaSection view={v} />
    </CsrfProvider>,
  )
}

describe('meeting agenda section', () => {
  it('offers agenda editing on a scheduled meeting', () => {
    renderSection(view(false, 'draft'))
    expect(screen.getByRole('button', { name: 'Add the scheduled hearings' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Move up' })).toBeTruthy()
  })

  it('shows a cancelled meeting agenda read-only', () => {
    renderSection(view(true, 'draft'))
    expect(screen.getByText('Minutes: Approve the March minutes')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Add an item')).toBeNull()
  })

  it('offers no reopen on a cancelled meeting with a published agenda', () => {
    renderSection(view(true, 'published'))
    expect(screen.queryByRole('button', { name: 'Reopen the agenda' })).toBeNull()
  })
})
