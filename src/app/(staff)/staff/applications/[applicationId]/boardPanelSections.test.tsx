// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { BoardPanelData } from '@/features/boards/panelData'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../../abutters/actions', () => ({}))
vi.mock('../../boards/actions', () => ({
  desDeterminationAction: vi.fn(),
  boardRegionalImpactAction: vi.fn(),
  terminateUnpaidAction: vi.fn(),
  addApplicantParcelAction: vi.fn(),
}))

const { DeterminationSection, ListSection, CostSection } = await import('./boardPanelSections')
const { desDeterminationAction, boardRegionalImpactAction, terminateUnpaidAction } = await import(
  '../../boards/actions'
)

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
  return screen.getByLabelText<HTMLSelectElement>(/^Determination( \*)?$/)
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

describe('refusals beside their fields on the board panel', () => {
  it('shows a refused DES reason beside the Reason field', async () => {
    const message = 'Enter a reason of at least 10 characters.'
    vi.mocked(desDeterminationAction).mockResolvedValue(refusal('reason', message))
    render(
      <CsrfProvider token="t">
        <DeterminationSection data={data('not_within')} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Record the NH DES determination'))
    await expectRefusalAfterSubmit(
      screen.getAllByRole('button', { name: 'Record determination' }).at(-1) as HTMLElement,
      () => screen.getByLabelText(/^Reason( \*)?$/),
      message,
    )
  })

  it('shows a refused municipality choice once, however many municipalities are listed', async () => {
    const message = 'Choose at least one affected municipality.'
    vi.mocked(boardRegionalImpactAction).mockResolvedValue(refusal('municipalityKeys', message))
    const options = [
      { key: 'dunmore', name: 'Town of Dunmore' },
      { key: 'pine_river', name: 'Town of Pine River' },
    ]
    render(
      <CsrfProvider token="t">
        <DeterminationSection
          data={{
            ...data('not_within'),
            canDetermine: true,
            regional: { text: null, summary: 'x', options, chosen: [] },
          }}
        />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Record the regional impact determination'))
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Record determination' })[0] as HTMLElement,
    )
    await screen.findAllByText(message)
    expect(document.querySelectorAll('[id$="-municipalityKeys-error"]')).toHaveLength(1)
  })

  it('shows a refused board reference beside the Board reference field', async () => {
    const message = 'Enter the board reference for the earlier determination.'
    vi.mocked(boardRegionalImpactAction).mockResolvedValue(refusal('previousBoardRef', message))
    render(
      <CsrfProvider token="t">
        <DeterminationSection data={{ ...data('not_within'), canDetermine: true }} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('Record the regional impact determination'))
    await expectRefusalAfterSubmit(
      screen.getAllByRole('button', { name: 'Record determination' })[0] as HTMLElement,
      () => screen.getByLabelText(/^Board reference, if determined earlier( \*)?$/),
      message,
    )
  })

  it('shows a refused reason beside the Reason field when ending an application', async () => {
    const message = 'Enter a reason of 1000 characters or fewer.'
    vi.mocked(terminateUnpaidAction).mockResolvedValue(refusal('reason', message))
    const costs = {
      applicationId: 'a1',
      canRecord: true,
      state: 'submitted',
      notice: { mailings: 3, dueCents: 9000 },
    } as unknown as BoardPanelData
    render(
      <CsrfProvider token="t">
        <CostSection data={costs} />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByText('End this application for unpaid notice costs'))
    fireEvent.change(screen.getByLabelText(/^Reason( \*)?$/), { target: { value: 'x' } })
    await expectRefusalAfterSubmit(
      screen.getByRole('button', { name: 'End the application' }),
      () => screen.getByLabelText(/^Reason( \*)?$/),
      message,
    )
  })
})
