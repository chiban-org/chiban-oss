// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { CHECK_ONLY_FIELD, CHECK_PASSED_COPY } from '@/constants/formCheck'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../actions', () => ({ scheduleMeetingAction: vi.fn() }))

const { AddMeeting } = await import('./AddMeeting')
const { scheduleMeetingAction } = await import('../actions')

afterEach(cleanup)

describe('adding a meeting', () => {
  it('asks for a start time that begins at 7:00 PM in the town time', () => {
    render(
      <CsrfProvider token="t">
        <AddMeeting boards={[['zba', 'Zoning Board']]} today="2027-05-01" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add meeting' }))
    const time = screen.getByLabelText(/^Start time( \*)?$/)
    expect(time.getAttribute('type')).toBe('time')
    expect((time as HTMLInputElement).value).toBe('19:00')
    expect(screen.getByText('In the town time zone.')).toBeTruthy()
  })

  it('shows a refused start time beside the Start time field', async () => {
    vi.mocked(scheduleMeetingAction).mockResolvedValue(
      refusal('startsAt', 'Enter the start time as a time of day, like 7:00 PM.'),
    )
    render(
      <CsrfProvider token="t">
        <AddMeeting boards={[['zba', 'Zoning Board']]} today="2027-05-01" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add meeting' }))
    fireEvent.change(screen.getByLabelText(/^Date( \*)?$/), { target: { value: '2027-05-05' } })
    await expectRefusalAfterSubmit(
      screen.getAllByRole('button', { name: 'Add meeting' }).at(-1) as HTMLElement,
      () => screen.getByLabelText(/^Start time( \*)?$/),
      'Enter the start time as a time of day, like 7:00 PM.',
    )
  })

  it('shows a refused location beside the Location field', async () => {
    vi.mocked(scheduleMeetingAction).mockResolvedValue(
      refusal('location', 'Enter a location of 200 characters or fewer.'),
    )
    render(
      <CsrfProvider token="t">
        <AddMeeting boards={[['zba', 'Zoning Board']]} today="2027-05-01" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add meeting' }))
    fireEvent.change(screen.getByLabelText(/^Date( \*)?$/), { target: { value: '2027-05-05' } })
    await expectRefusalAfterSubmit(
      screen.getAllByRole('button', { name: 'Add meeting' }).at(-1) as HTMLElement,
      () => screen.getByLabelText(/^Location( \*)?$/),
      'Enter a location of 200 characters or fewer.',
    )
  })
})

describe('adding a meeting dated in the past', () => {
  function openWithDate(date: string) {
    vi.mocked(scheduleMeetingAction).mockReset()
    vi.mocked(scheduleMeetingAction).mockImplementation((formData: FormData) =>
      Promise.resolve(
        formData.has(CHECK_ONLY_FIELD)
          ? { ok: false, error: CHECK_PASSED_COPY }
          : { ok: true, message: 'Meeting added to the calendar.' },
      ),
    )
    render(
      <CsrfProvider token="t">
        <AddMeeting boards={[['zba', 'Zoning Board']]} today="2027-05-01" />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add meeting' }))
    fireEvent.change(screen.getByLabelText(/^Date( \*)?$/), { target: { value: date } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add meeting' }).at(-1) as HTMLElement)
  }

  const saved = () =>
    vi.mocked(scheduleMeetingAction).mock.calls.filter(([f]) => !f.has(CHECK_ONLY_FIELD))

  it('asks for confirmation before saving and saves once confirmed', async () => {
    openWithDate('2027-04-30')
    expect(
      await screen.findByRole('heading', { name: 'Add a meeting dated in the past?' }),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'The date is before today. Add a past meeting only to record a meeting that was already held.',
      ),
    ).toBeTruthy()
    expect(saved()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Add the past meeting' }))
    await waitFor(() => expect(saved()).toHaveLength(1))
  })

  it('saves nothing when the confirmation is cancelled', async () => {
    openWithDate('2027-04-30')
    await screen.findByRole('heading', { name: 'Add a meeting dated in the past?' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Add a meeting dated in the past?' }),
      ).toBeNull(),
    )
    expect(saved()).toEqual([])
  })

  it('saves a meeting dated today without asking', async () => {
    openWithDate('2027-05-01')
    await waitFor(() => expect(saved()).toHaveLength(1))
    expect(screen.queryByRole('heading', { name: 'Add a meeting dated in the past?' })).toBeNull()
  })
})
