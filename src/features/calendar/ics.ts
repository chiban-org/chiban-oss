export interface CalendarBooking {
  uid: string
  sequence: number
  startUtc: Date
  endUtc: Date
  summary: string
  description: string
  location: string
  organizerEmail: string
  attendeeEmail: string
  attendeeName: string
  targetUserRef?: string | null
}

export type IcsMethod = 'REQUEST' | 'CANCEL'

const MAX_OCTETS = 75
const CRLF = '\r\n'
const ORGANIZER_NAME = 'Town of Alder Pond'

function utcStamp(instant: Date): string {
  return instant
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

function escapeParam(value: string): string {
  return value.replace(/[";:,]/g, ' ')
}

function parseMailbox(value: string): { name: string; address: string } {
  const match = /^\s*(.*?)\s*<([^<>]+)>\s*$/.exec(value)
  if (match === null) return { name: ORGANIZER_NAME, address: value.trim() }
  const name = (match[1] ?? '').replace(/^"|"$/g, '').trim()
  return { name: name === '' ? ORGANIZER_NAME : name, address: (match[2] ?? '').trim() }
}

export function foldLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let octets = 0
  let limit = MAX_OCTETS
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8')
    if (octets + size > limit) {
      out.push(current)
      current = ' '
      octets = 1
      limit = MAX_OCTETS
    }
    current += char
    octets += size
  }
  out.push(current)
  return out
}

export function buildIcs(booking: CalendarBooking, method: IcsMethod, now: Date): string {
  const status = method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'
  const organizer = parseMailbox(booking.organizerEmail)
  const attendee = `ATTENDEE;CN=${escapeParam(booking.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${booking.attendeeEmail}`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chiban//Inspections//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${booking.uid}`,
    `SEQUENCE:${booking.sequence}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(booking.startUtc)}`,
    `DTEND:${utcStamp(booking.endUtc)}`,
    `SUMMARY:${escapeText(booking.summary)}`,
    `DESCRIPTION:${escapeText(booking.description)}`,
    `LOCATION:${escapeText(booking.location)}`,
    `ORGANIZER;CN=${escapeParam(organizer.name)}:mailto:${organizer.address}`,
    attendee,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.flatMap(foldLine).join(CRLF) + CRLF
}
