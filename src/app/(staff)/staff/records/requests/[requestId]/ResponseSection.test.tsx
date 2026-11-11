// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import type { RtkRequestView } from '@/features/rtk/requests'
import type { CivilDate } from '@/types/civilDate'
import { FirstResponseForm } from './FirstResponseForm'
import { ResponseSection } from './ResponseSection'

const action = vi.hoisted(() => vi.fn())
vi.mock('../actions', () => ({ firstResponseAction: action }))

afterEach(cleanup)

const REQUEST_ID = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d'

function renderForm(canDeny = false, startOnRelease = false) {
  render(
    <CsrfProvider token="t1">
      <FirstResponseForm
        requestId={REQUEST_ID}
        today={'2026-11-05' as CivilDate}
        canDeny={canDeny}
        startOnRelease={startOnRelease}
        releaseStep={<p>Release step here</p>}
        letterNote="The letter will be emailed to jordan@example.test."
      />
    </CsrfProvider>,
  )
}

const radio = (name: string) =>
  screen.getByRole('radio', { name: (accessible) => accessible.startsWith(name) })
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Record response' }))

describe('first response form', () => {
  it('says before sending where the letter will go', () => {
    renderForm()
    expect(screen.getByText('The letter will be emailed to jordan@example.test.')).toBeTruthy()
  })

  it('starts with no response chosen and asks for one before sending', () => {
    renderForm()
    expect(screen.getAllByRole('radio').some((r) => (r as HTMLInputElement).checked)).toBe(false)
    submit()
    expect(screen.getByRole('status').textContent).toBe('Choose a response.')
    expect(action).not.toHaveBeenCalled()
  })

  it('a time statement without its date names the date field and moves focus to it', () => {
    renderForm()
    fireEvent.click(radio('Written statement of the time needed'))
    submit()
    const date = screen.getByLabelText(/^Date the town will respond by/)
    expect(screen.getByRole('status').textContent).toBe(
      'Fill in: Date the town will respond by, Why more time is needed.',
    )
    expect(document.activeElement).toBe(date)
    expect(action).not.toHaveBeenCalled()
  })

  it('a posted-online response asks for its web address', () => {
    renderForm()
    fireEvent.click(radio('Records are posted on the town website'))
    submit()
    expect(screen.getByRole('status').textContent).toBe(
      'Fill in: Web address where the records are posted.',
    )
  })

  it('offers Denied only once a withholding exists, and says why otherwise', () => {
    renderForm(false)
    const denied = radio('Denied') as HTMLInputElement
    expect(denied.disabled).toBe(true)
    expect(denied.getAttribute('aria-describedby')).not.toBeNull()
    expect(
      screen.getByText('Record a withheld record with its exemption and explanation first.'),
    ).toBeTruthy()
    cleanup()
    renderForm(true)
    expect((radio('Denied') as HTMLInputElement).disabled).toBe(false)
  })

  it('a denial offers neither the date the town will respond by, the web address nor a charge', () => {
    renderForm(true)
    fireEvent.click(radio('Denied'))
    expect(screen.queryByLabelText(/^Date the town will respond by/)).toBeNull()
    expect(screen.queryByLabelText(/^Web address/)).toBeNull()
    expect(screen.queryByLabelText(/^Charge/)).toBeNull()
  })

  it('Release the records now swaps the form for the release step', () => {
    renderForm()
    fireEvent.click(radio('Release the records now'))
    expect(screen.getByText('Release step here')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Record response' })).toBeNull()
  })

  it('opens on the release step after a search', () => {
    renderForm(false, true)
    expect((radio('Release the records now') as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText('Release step here')).toBeTruthy()
  })
})

describe('recorded first response', () => {
  function renderRecorded(patch: Partial<RtkRequestView>) {
    const recorded = {
      id: REQUEST_ID,
      firstResponseKind: 'time_statement',
      firstResponseOn: '2026-11-05',
      deniedOn: null,
      timeliness: { kind: 'responded_on_time' },
      timeStatements: [],
      ...patch,
    } as unknown as RtkRequestView
    render(<ResponseSection request={recorded} />)
  }

  it('puts a comma and a space between the response and its date', () => {
    renderRecorded({})
    expect(screen.getByText(/^Written statement of the time needed/).textContent).toBe(
      'Written statement of the time needed, November 5, 2026.',
    )
  })

  it('shows the response alone when no date is recorded', () => {
    renderRecorded({ firstResponseOn: null })
    expect(screen.getByText(/^Written statement of the time needed/).textContent).toBe(
      'Written statement of the time needed.',
    )
  })

  it('records a denial made after the time statement', () => {
    renderRecorded({ deniedOn: '2026-11-20' as CivilDate })
    expect(screen.getByText('Denied after the time statement, November 20, 2026.')).toBeTruthy()
  })
})
