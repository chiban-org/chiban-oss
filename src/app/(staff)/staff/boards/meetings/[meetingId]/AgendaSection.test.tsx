// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
const { addAgendaItemAction } = await import('../../hearings/actions')

afterEach(cleanup)

function view(cancelled: boolean, status: 'draft' | 'published'): MeetingView {
  return {
    meetingId: 'm1',
    cancelled,
    hearings: [{ id: 'h1', text: 'SPR-2026-0001', statusText: 'Scheduled', status: 'scheduled' }],
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

  it('offers no hearing import when no hearings are scheduled', () => {
    renderSection({ ...view(false, 'draft'), hearings: [] })
    expect(screen.queryByRole('button', { name: 'Add the scheduled hearings' })).toBeNull()
    expect(screen.getByText('Add an item')).toBeTruthy()
  })

  it('leaves the first step of an empty agenda to the rail', () => {
    renderSection({ ...view(false, 'draft'), hearings: [], agenda: null })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText('Add an item')).toBeNull()
    expect(screen.getByText('The agenda has no items yet.')).toBeTruthy()
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

  it('shows a refused title beside the Title field', async () => {
    vi.mocked(addAgendaItemAction).mockResolvedValue({
      ok: false,
      error: 'Enter a title.',
      fieldErrors: { title: 'Enter a title.' },
    })
    renderSection(view(false, 'draft'))
    fireEvent.click(screen.getByText('Add an item'))
    fireEvent.change(screen.getByLabelText(/^Title( \*)?$/), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const title = screen.getByLabelText<HTMLInputElement>(/^Title( \*)?$/)
    await waitFor(() => expect(title.getAttribute('aria-invalid')).toBe('true'))
    const described = (title.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
    expect(described).toContain('Enter a title.')
  })
})
