import { describe, expect, it } from 'vitest'
import { linkPacketMail, memberPacketMail, updatePacketMail } from '@/features/boards/packetMail'

const PACKET = {
  title: 'Alder Pond Zoning Board of Adjustment packet, December 15, 2026',
  meetingDate: '2026-12-15',
  place: { startsAtMinute: 1140, location: 'Town Hall, Meeting Room 2' },
}
const WHEN = 'Tuesday, December 15, 2026 at 7:00 PM, Town Hall, Meeting Room 2'

describe('packet email', () => {
  it('names the date once in the subject when the title already carries it', () => {
    const mail = memberPacketMail('bea@example.org', PACKET)
    expect(mail.subject).toBe(
      'Board packet: Alder Pond Zoning Board of Adjustment packet, December 15, 2026',
    )
    expect(
      updatePacketMail('bea@example.org', PACKET, { summary: '', viaLink: false }).subject,
    ).toBe('Board packet updated: Alder Pond Zoning Board of Adjustment packet, December 15, 2026')
  })

  it('adds the date to a subject whose title lacks it', () => {
    const mail = memberPacketMail('bea@example.org', { ...PACKET, title: 'April agenda' })
    expect(mail.subject).toBe('Board packet: April agenda, meeting December 15, 2026')
  })

  it('tells a member when and where the meeting is', () => {
    const mail = memberPacketMail('bea@example.org', PACKET)
    expect(mail.text).toContain(`The packet for the meeting on ${WHEN} is ready.`)
    expect(mail.text).toContain('/board')
    expect(mail.html).toContain(WHEN)
  })

  it('tells an outside reader when and where the meeting is', () => {
    const mail = linkPacketMail({ name: 'Robin Vale', email: 'robin@example.org' }, PACKET, {
      url: 'https://town.example/board/packets/abc',
      days: 14,
    })
    expect(mail.text).toContain(`Robin Vale, the packet for the meeting on ${WHEN} is ready.`)
    expect(mail.text).toContain('The link expires in 14 days.')
  })

  it('falls back to the date alone for a packet with no meeting time on file', () => {
    const mail = memberPacketMail('bea@example.org', { ...PACKET, place: null })
    expect(mail.text).toContain('The packet for the meeting on December 15, 2026 is ready.')
  })
})
