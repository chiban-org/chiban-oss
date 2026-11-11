// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { expectRefusalAfterSubmit, refusal } from '@/test/besideField'

vi.mock('../actions', () => ({ scheduleMeetingAction: vi.fn() }))

const { AddMeeting } = await import('./AddMeeting')
const { scheduleMeetingAction } = await import('../actions')

afterEach(cleanup)

describe('adding a meeting', () => {
  it('asks for a start time that begins at 7:00 PM in the town time', () => {
    render(
      <CsrfProvider token="t">
        <AddMeeting boards={[['zba', 'Zoning Board']]} />
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
        <AddMeeting boards={[['zba', 'Zoning Board']]} />
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
        <AddMeeting boards={[['zba', 'Zoning Board']]} />
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
