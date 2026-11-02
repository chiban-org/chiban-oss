import { describe, expect, it } from 'vitest'
import { buildIcs, type CalendarBooking } from '@/features/calendar/ics'

const NOW = new Date('2027-11-01T12:00:00Z')

const booking: CalendarBooking = {
  uid: 'inspection-0b6f@alderpond.example',
  sequence: 0,
  startUtc: new Date('2027-11-08T14:30:00Z'),
  endUtc: new Date('2027-11-08T15:30:00Z'),
  summary: 'Final inspection, EL-2027-0001',
  description: 'Site: 12 Elm Road\nContact: Pat, 603-555-0100',
  location: '12 Elm Road',
  organizerEmail: 'noreply@alderpond.example',
  attendeeEmail: 'inspector@alderpond.example',
  attendeeName: 'Ines Inspector',
}

function lines(ics: string): string[] {
  return ics.split('\r\n')
}

describe('buildIcs', () => {
  it('request ics has METHOD:REQUEST, UID, SEQUENCE:0, DTSTART:20271108T143000Z', () => {
    const ics = buildIcs(booking, 'REQUEST', NOW).replace(/\r\n /g, '')
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('PRODID:-//Chiban//Inspections//EN')
    expect(ics).toContain('METHOD:REQUEST')
    expect(ics).toContain('UID:inspection-0b6f@alderpond.example')
    expect(ics).toContain('SEQUENCE:0')
    expect(ics).toContain('DTSTART:20271108T143000Z')
    expect(ics).toContain('DTEND:20271108T153000Z')
    expect(ics).toContain('DTSTAMP:20271101T120000Z')
    expect(ics).toContain('STATUS:CONFIRMED')
    expect(ics).toContain('ORGANIZER;CN=Town of Alder Pond:mailto:noreply@alderpond.example')
    expect(ics).toContain(
      'ATTENDEE;CN=Ines Inspector;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:inspector@alderpond.example',
    )
  })

  it('writes a clean mailto when the organizer is a display name with angle brackets', () => {
    const ics = buildIcs(
      { ...booking, organizerEmail: 'Town of Alder Pond <noreply@alderpond.example>' },
      'REQUEST',
      NOW,
    )
    expect(ics).toContain('ORGANIZER;CN=Town of Alder Pond:mailto:noreply@alderpond.example\r\n')
    expect(ics).not.toContain('<')
  })

  it('cancel ics has METHOD:CANCEL and STATUS:CANCELLED with the same UID', () => {
    const ics = buildIcs({ ...booking, sequence: 1 }, 'CANCEL', NOW)
    expect(ics).toContain('METHOD:CANCEL')
    expect(ics).toContain('STATUS:CANCELLED')
    expect(ics).toContain('UID:inspection-0b6f@alderpond.example')
    expect(ics).toContain('SEQUENCE:1')
  })

  it('every line ends in CRLF and no line exceeds 75 octets', () => {
    const long = { ...booking, description: 'x'.repeat(300) }
    const ics = buildIcs(long, 'REQUEST', NOW)
    expect(ics.endsWith('\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    for (const line of lines(ics)) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
    }
  })

  it('folding never splits the e in "Café Road"', () => {
    const prefix = 'LOCATION:'.length
    const location = `${'a'.repeat(75 - prefix - 3)}Café Road`
    const ics = buildIcs({ ...booking, location }, 'REQUEST', NOW)
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain(`LOCATION:${location}`)
    for (const line of lines(ics)) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75)
      expect(line).not.toContain('�')
    }
  })

  it('comma, semicolon, and newline in access notes are escaped', () => {
    const ics = buildIcs(
      { ...booking, description: 'Gate; code 12, dog\nback door' },
      'REQUEST',
      NOW,
    )
    expect(ics.replace(/\r\n /g, '')).toContain('DESCRIPTION:Gate\; code 12\\, dog\\nback door')
  })

  it('backslash is escaped', () => {
    const ics = buildIcs({ ...booking, description: 'a\\b' }, 'REQUEST', NOW)
    expect(ics).toContain('DESCRIPTION:a\\\\b')
  })
})
