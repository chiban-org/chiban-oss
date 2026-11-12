import { describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import {
  cancelledPacketMail,
  linkPacketMail,
  memberPacketMail,
  updatePacketMail,
} from '@/features/boards/packetMail'
import {
  boardMemberValues,
  boardPacketValues,
  packetCancelValues,
  packetLinkValues,
  packetUpdateValues,
  wordingLink,
} from '@/features/notifications/wording/externalValues'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'

const PACKET = {
  title: 'Alder Pond Zoning Board of Adjustment packet, December 15, 2026',
  meetingDate: '2026-12-15',
  place: { startsAtMinute: 1140, location: 'Town Hall, Meeting Room 2' },
}
const UNDATED = { ...PACKET, title: 'April agenda', place: null }
const BOARD = `${env.BASE_URL}/board`
describe('board_packet_ready default', () => {
  for (const packet of [PACKET, UNDATED]) {
    it(`matches memberPacketMail for ${packet.title}`, () => {
      const old = memberPacketMail('a@example.org', packet)
      const next = renderWording(
        DEFAULT_WORDING.board_packet_ready,
        boardPacketValues(packet),
        wordingLink('board_packet_ready', BOARD),
      )
      expect(next.subject).toBe(old.subject)
      expect(next.text).toBe(old.text)
      expect(next.html).toBe(old.html.replace(BOARD, `<a href="${BOARD}">${BOARD}</a>`))
    })
  }
})

describe('board_packet_link default', () => {
  it('matches linkPacketMail in subject and text', () => {
    const url = 'https://town.example/board/packets/abc'
    const old = linkPacketMail({ name: 'Robin Vale', email: 'robin@example.org' }, PACKET, {
      url,
      days: 14,
    })
    const next = renderWording(
      DEFAULT_WORDING.board_packet_link,
      packetLinkValues(PACKET, { name: 'Robin Vale' }, { days: 14 }),
      wordingLink('board_packet_link', url),
    )
    expect(next.subject).toBe(old.subject)
    expect(next.text).toBe(old.text)
    expect(next.html).toBe(old.html.replace(`<p>${url}</p>`, `<p><a href="${url}">${url}</a></p>`))
  })
})

describe('board_packet_updated default', () => {
  const input = { summary: 'The staff report was replaced.', viaLink: true }

  it('matches updatePacketMail exactly for a reader who came by link', () => {
    const old = updatePacketMail('a@example.org', PACKET, input)
    const next = renderWording(
      DEFAULT_WORDING.board_packet_updated,
      packetUpdateValues(PACKET, input),
      null,
    )
    expect(next).toEqual({ subject: old.subject, text: old.text, html: old.html })
  })

  it('puts the sign-in sentence before the link for a signed-in reader', () => {
    const old = updatePacketMail('a@example.org', PACKET, { ...input, viaLink: false })
    const next = renderWording(
      DEFAULT_WORDING.board_packet_updated,
      packetUpdateValues(PACKET, { ...input, viaLink: false }),
      wordingLink('board_packet_updated', BOARD),
    )
    expect(next.subject).toBe(old.subject)
    expect(next.text).toBe(
      'The packet for the December 15, 2026 meeting changed. The staff report was replaced.\n\nSign in to read it.\n\n' +
        `${BOARD}\n`,
    )
  })
})

describe('board_meeting_cancelled default', () => {
  it('matches cancelledPacketMail exactly', () => {
    const old = cancelledPacketMail('a@example.org', PACKET, 'the hearing room is closed')
    const next = renderWording(
      DEFAULT_WORDING.board_meeting_cancelled,
      packetCancelValues(PACKET, 'the hearing room is closed'),
      null,
    )
    expect(next).toEqual({ subject: old.subject, text: old.text, html: old.html })
  })
})

describe('board_member_added default', () => {
  it('matches the invitation text', () => {
    const next = renderWording(
      DEFAULT_WORDING.board_member_added,
      boardMemberValues({ boardName: 'Alder Pond Planning Board', titleLabel: 'Alternate' }),
      wordingLink('board_member_added', BOARD),
    )
    const body = `You have been added to the Alder Pond Planning Board as alternate. Sign in with your email address at ${BOARD} to read meeting packets. We will email you a one-time sign-in link when you ask for it.\n`
    expect(next.subject).toBe('Board membership: Alder Pond Planning Board')
    expect(next.text).toBe(body)
    expect(next.html).toBe(
      `<p>${body.trim().replace(BOARD, `<a href="${BOARD}">${BOARD}</a>`)}</p>`,
    )
  })
})
