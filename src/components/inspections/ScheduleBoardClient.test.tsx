// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsrfProvider } from '@/components/CsrfProvider'
import { ScheduleBoardClient } from '@/components/inspections/ScheduleBoardClient'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))

afterEach(cleanup)

describe('ScheduleBoardClient', () => {
  it('posts the schedule action with the same fields as before', async () => {
    const scheduleAction = vi.fn((_data: FormData) =>
      Promise.resolve({ ok: true as const, message: 'Scheduled.' }),
    )
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
          today="2027-07-06"
          takeRequest={null}
          scheduleAction={scheduleAction}
        />
      </CsrfProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Choose EL-2027-0001/ }))
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
})
