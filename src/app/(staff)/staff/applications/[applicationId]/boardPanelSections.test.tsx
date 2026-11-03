// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { BoardPanelData } from '@/features/boards/panelData'

vi.mock('../../abutters/actions', () => ({}))
vi.mock('../../boards/actions', () => ({ desDeterminationAction: vi.fn() }))

const { DeterminationSection, ListSection } = await import('./boardPanelSections')

afterEach(cleanup)

function data(suggested: 'within_500ft' | 'not_within' | null): BoardPanelData {
  return {
    applicationId: 'a1',
    canDetermine: false,
    canManage: true,
    regional: { summary: 'No regional impact.', options: [], chosen: [] },
    des: {
      applies: true,
      suggestion: 'The map suggests this parcel is farther than 500 feet from any water body.',
      distanceText: 'Nearest water body: about 2200 feet from the parcel.',
      determinationText: null,
      suggestedDetermination: suggested,
    },
  } as unknown as BoardPanelData
}

function determination(): HTMLSelectElement {
  return screen.getByLabelText<HTMLSelectElement>('Determination')
}

describe('NH DES determination form', () => {
  it('starts on the answer the map suggests', () => {
    render(
      <CsrfProvider token="t">
        <DeterminationSection data={data('not_within')} />
      </CsrfProvider>,
    )
    expect(determination().value).toBe('not_within')
  })

  it('makes staff choose when the map cannot suggest an answer', () => {
    render(
      <CsrfProvider token="t">
        <DeterminationSection data={data(null)} />
      </CsrfProvider>,
    )
    expect(determination().value).toBe('')
    expect(determination().required).toBe(true)
  })
})

describe('abutter lists on the board panel', () => {
  function lists(canOpenLists: boolean): BoardPanelData {
    return {
      ...data(null),
      canManage: false,
      canOpenLists,
      parcels: ['009001000000'],
      professionals: [],
      lists: [
        { id: 'l1', version: 1, statusText: 'Issued', drawnText: 'October 2, 2026', issued: true },
      ],
    }
  }

  it('links each version to its list for a viewer who can open lists', () => {
    render(<ListSection data={lists(true)} />)
    expect(screen.getByRole('link', { name: 'Version 1' }).getAttribute('href')).toBe(
      '/staff/abutters/l1',
    )
  })

  it('shows the version as text for a viewer who cannot open lists', () => {
    render(<ListSection data={lists(false)} />)
    expect(screen.queryByRole('link', { name: 'Version 1' })).toBeNull()
    expect(screen.getByText('Version 1, Issued, drawn October 2, 2026')).toBeTruthy()
  })
})
