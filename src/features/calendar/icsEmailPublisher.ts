import { buildIcs, type CalendarBooking, type IcsMethod } from '@/features/calendar/ics'
import type { CalendarError, CalendarPublisher } from '@/features/calendar/publisher'
import type { MailTransport } from '@/features/mail/transport'
import { err, ok, type Result } from '@/types/result'

interface Deps {
  mail: MailTransport
  organizerEmail: string
  now?: () => Date
}

function subjectFor(booking: CalendarBooking, method: IcsMethod): string {
  if (method === 'CANCEL') return `Cancelled: ${booking.summary}`
  return booking.sequence > 0 ? `Updated: ${booking.summary}` : booking.summary
}

export function createIcsEmailPublisher(deps: Deps): CalendarPublisher {
  const now = deps.now ?? (() => new Date())
  async function send(
    booking: CalendarBooking,
    method: IcsMethod,
    signal: AbortSignal,
  ): Promise<Result<void, CalendarError>> {
    const subject = subjectFor(booking, method)
    const text = `${subject}\n\n${booking.description}\n`
    const sent = await deps.mail.send(
      {
        to: booking.attendeeEmail,
        subject,
        text,
        html: `<p>${subject}</p>`,
        icalEvent: {
          method,
          filename: 'inspection.ics',
          content: buildIcs({ ...booking, organizerEmail: deps.organizerEmail }, method, now()),
        },
      },
      signal,
    )
    return sent.ok ? ok(undefined) : err({ kind: 'unreachable', detail: 'mail transport failed' })
  }
  return {
    kind: 'ics_email',
    async publish(booking, _previousRef, signal) {
      const sent = await send(booking, 'REQUEST', signal)
      return sent.ok ? ok({ externalRef: null }) : sent
    },
    cancel: (booking, _externalRef, signal) => send(booking, 'CANCEL', signal),
  }
}
