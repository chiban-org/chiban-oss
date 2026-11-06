// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { findIsoDates, findUuids } from '@/test/leaks'

vi.mock('./notesActions', () => ({
  addApplicationNoteAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { NotesPanel } = await import('./notesPanel')

afterEach(cleanup)

const ZONE = 'America/New_York'
const NOTES = [
  {
    id: 'b2b2b2b2-0000-4000-8000-000000000002',
    body: 'Septic design received.',
    authorName: 'Pat Planner',
    createdAt: new Date('2026-11-03T15:30:00Z'),
  },
  {
    id: 'a1a1a1a1-0000-4000-8000-000000000001',
    body: 'Asked the owner for the septic design.',
    authorName: null,
    createdAt: new Date('2026-11-02T14:00:00Z'),
  },
]

function mount(canAdd: boolean, notes = NOTES) {
  return render(
    <CsrfProvider token="t">
      <NotesPanel applicationId="app-1" notes={notes} canAdd={canAdd} zone={ZONE} />
    </CsrfProvider>,
  )
}

describe('staff notes panel', () => {
  it('lists notes in the order given with author and time in words', () => {
    const { container } = mount(false)
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent)
    expect(items[0]).toContain('Pat Planner')
    expect(items[0]).toContain('Septic design received.')
    expect(items[1]).toContain('Staff')
    expect(items[1]).toContain('Asked the owner for the septic design.')
    expect(findIsoDates(container.textContent)).toEqual([])
    expect(findUuids(container.textContent)).toEqual([])
  })

  it('says the notes are internal', () => {
    const { container } = mount(false)
    expect(container.textContent).toContain('Applicants, reviewers and board members do not see')
  })

  it('offers Add a note only to those who can add one', () => {
    expect(mount(false).queryByText('Add a note')).toBeNull()
    cleanup()
    expect(mount(true).getByText('Add a note')).toBeTruthy()
  })

  it('says when there are no notes yet', () => {
    expect(mount(true, []).container.textContent).toContain('No notes yet.')
  })
})
