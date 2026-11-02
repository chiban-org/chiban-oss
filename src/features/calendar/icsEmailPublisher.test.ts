import { describe, expect, it, vi } from 'vitest'
import type { CalendarBooking } from '@/features/calendar/ics'
import { createIcsEmailPublisher } from '@/features/calendar/icsEmailPublisher'
import type { MailMessage, MailTransport } from '@/features/mail/transport'

const booking: CalendarBooking = {
  uid: 'inspection-0b6f@alderpond.example',
  sequence: 0,
  startUtc: new Date('2027-11-08T14:30:00Z'),
  endUtc: new Date('2027-11-08T15:30:00Z'),
  summary: 'Final inspection, EL-2027-0001',
  description: 'Site: 12 Elm Road',
  location: '12 Elm Road',
  organizerEmail: 'unused',
  attendeeEmail: 'inspector@alderpond.example',
  attendeeName: 'Ines Inspector',
}

function setup() {
  const send = vi.fn((_message: MailMessage, _signal: AbortSignal) =>
    Promise.resolve({ ok: true as const, value: undefined }),
  )
  const mail = { send } as unknown as MailTransport
  const publisher = createIcsEmailPublisher({
    mail,
    organizerEmail: 'Town of Alder Pond <noreply@alderpond.example>',
  })
  return { send, publisher }
}

const signal = new AbortController().signal

describe('createIcsEmailPublisher', () => {
  it('sends a first invite with the plain summary as the subject', async () => {
    const { send, publisher } = setup()
    await publisher.publish(booking, null, signal)
    expect(send.mock.calls[0]?.[0].subject).toBe('Final inspection, EL-2027-0001')
  })

  it('marks a reschedule with an Updated subject and a clean organizer', async () => {
    const { send, publisher } = setup()
    await publisher.publish({ ...booking, sequence: 2 }, null, signal)
    const message = send.mock.calls[0]?.[0]
    expect(message?.subject).toBe('Updated: Final inspection, EL-2027-0001')
    expect(message?.icalEvent?.content).toContain(
      'ORGANIZER;CN=Town of Alder Pond:mailto:noreply@alderpond.example',
    )
  })

  it('keeps the Cancelled subject for a cancel', async () => {
    const { send, publisher } = setup()
    await publisher.cancel({ ...booking, sequence: 3 }, null, signal)
    expect(send.mock.calls[0]?.[0].subject).toBe('Cancelled: Final inspection, EL-2027-0001')
  })
})
