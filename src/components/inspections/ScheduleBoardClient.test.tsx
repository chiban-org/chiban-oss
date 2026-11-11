// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ScheduleBoardClient } from '@/components/inspections/ScheduleBoardClient'
import type { ActionResult } from '@/server/actionRunner'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

afterEach(cleanup)

function renderClient(scheduleAction: (data: FormData) => Promise<ActionResult>) {
  render(
    <CsrfProvider token="tok">
      <ScheduleBoardClient
        requests={[
          {
            inspectionId: 'i1',
            rowVersion: 3,
            applicationNumber: 'EL-2027-0001',
            typeLabel: 'Rough',
            channel: 'phone',
            preferredDate: null,
            isReinspection: false,
            address: '12 Elm Road',
            contactName: 'Pat',
          },
        ]}
        days={[
          {
            date: '2027-07-14',
            inspectorUserId: 'u1',
            inspectorName: 'Ines Inspector',
            freeStarts: [570],
            booked: 0,
          },
        ]}
        bookings={[]}
        inspectors={[{ userId: 'u1', name: 'Ines Inspector' }]}
        today="2027-07-06"
        takeRequest={null}
        scheduleAction={scheduleAction}
      />
    </CsrfProvider>,
  )
}

describe('ScheduleBoardClient', () => {
  it('posts the schedule action with the same fields as before', async () => {
    const scheduleAction = vi.fn((_data: FormData) =>
      Promise.resolve({ ok: true as const, message: 'Scheduled.' }),
    )
    renderClient(scheduleAction)
    fireEvent.click(screen.getByRole('button', { name: /Choose EL-2027-0001/ }))
    fireEvent.click(screen.getByRole('button', { name: /^1 open, Wednesday, July 14, 2027/ }))
    fireEvent.click(screen.getByRole('button', { name: /9:30 AM/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Book' }))
    await waitFor(() => expect(scheduleAction).toHaveBeenCalledTimes(1))
    const sent = Object.fromEntries(scheduleAction.mock.calls[0]?.[0].entries() ?? [])
    expect(sent).toEqual({
      csrf_token: 'tok',
      inspectionId: 'i1',
      inspectorUserId: 'u1',
      date: '2027-07-14',
      startMinute: '570',
      expectedRowVersion: '3',
    })
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Scheduled.'))
    expect(refresh).toHaveBeenCalled()
  })

  it('asks for a reason when the server refuses the time as off the grid, then sends it', async () => {
    const copy = 'That start time is not one of the town slots. Add a reason to book it anyway.'
    const scheduleAction = vi
      .fn<(data: FormData) => Promise<ActionResult>>()
      .mockResolvedValueOnce({ ok: false, error: copy, fieldErrors: { offGridReason: copy } })
      .mockResolvedValueOnce({ ok: true, message: 'Scheduled.' })
    renderClient(scheduleAction)
    fireEvent.click(screen.getByRole('button', { name: /Choose EL-2027-0001/ }))
    fireEvent.click(screen.getByRole('button', { name: /^1 open, Wednesday, July 14, 2027/ }))
    fireEvent.click(screen.getByRole('button', { name: /9:30 AM/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Book' }))
    const review = screen.getByRole('group', { name: 'Review the booking' })
    const reason = await within(review).findByLabelText(
      /^Reason for booking outside the town slots/,
    )
    fireEvent.change(reason, { target: { value: 'Contractor asked for it' } })
    fireEvent.click(screen.getByRole('button', { name: 'Book' }))
    await waitFor(() => expect(scheduleAction).toHaveBeenCalledTimes(2))
    const sent = scheduleAction.mock.calls[1]?.[0]
    expect(sent?.get('offGridReason')).toBe('Contractor asked for it')
    expect(sent?.get('startMinute')).toBe('570')
  })

  it('books a time that is not listed with the reason given', async () => {
    const scheduleAction = vi.fn((_data: FormData) =>
      Promise.resolve({ ok: true as const, message: 'Scheduled.' }),
    )
    renderClient(scheduleAction)
    fireEvent.click(screen.getByRole('button', { name: /Choose EL-2027-0001/ }))
    fireEvent.click(screen.getByText('Book a time that is not listed'))
    const form = screen.getByRole('group', { name: 'Book a time that is not listed' })
    fireEvent.change(within(form).getByLabelText(/^Inspector/), { target: { value: 'u1' } })
    fireEvent.change(within(form).getByLabelText(/^Day/), { target: { value: '2027-07-13' } })
    fireEvent.change(within(form).getByLabelText(/^Start time/), { target: { value: '10:00' } })
    fireEvent.change(within(form).getByLabelText(/^Reason for booking outside the town slots/), {
      target: { value: 'Inspector is free that Tuesday' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Book this time' }))
    await waitFor(() => expect(scheduleAction).toHaveBeenCalledTimes(1))
    const sent = Object.fromEntries(scheduleAction.mock.calls[0]?.[0].entries() ?? [])
    expect(sent).toEqual({
      csrf_token: 'tok',
      inspectionId: 'i1',
      inspectorUserId: 'u1',
      date: '2027-07-13',
      startMinute: '600',
      expectedRowVersion: '3',
      offGridReason: 'Inspector is free that Tuesday',
    })
  })
})
