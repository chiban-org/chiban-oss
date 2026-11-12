import { describe, expect, it } from 'vitest'
import { env } from '@/config/env'
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
const TITLE = 'Alder Pond Zoning Board of Adjustment packet, December 15, 2026'
const WHEN = 'Tuesday, December 15, 2026 at 7:00 PM, Town Hall, Meeting Room 2'
const LINK_URL = 'https://town.example/board/packets/abc'
const linkHtml = (url: string) => `<a href="${url}">${url}</a>`

describe('board_packet_ready default', () => {
  const cases = [
    {
      packet: PACKET,
      subject: `Board packet: ${TITLE}`,
      text: `The packet for the meeting on ${WHEN} is ready.\n\nSign in at ${BOARD} to read it.\n`,
      html: `<p>The packet for the meeting on ${WHEN} is ready.</p><p>Sign in at ${linkHtml(BOARD)} to read it.</p>`,
    },
    {
      packet: UNDATED,
      subject: 'Board packet: April agenda, meeting December 15, 2026',
      text: `The packet for the meeting on December 15, 2026 is ready.\n\nSign in at ${BOARD} to read it.\n`,
      html: `<p>The packet for the meeting on December 15, 2026 is ready.</p><p>Sign in at ${linkHtml(BOARD)} to read it.</p>`,
    },
  ]
  for (const expected of cases) {
    it(`matches the old message for ${expected.packet.title}`, () => {
      const next = renderWording(
        DEFAULT_WORDING.board_packet_ready,
        boardPacketValues(expected.packet),
        wordingLink('board_packet_ready', BOARD),
      )
      expect(next).toEqual({
        subject: expected.subject,
        text: expected.text,
        html: expected.html,
      })
    })
  }
})

describe('board_packet_link default', () => {
  it('matches the old message', () => {
    const next = renderWording(
      DEFAULT_WORDING.board_packet_link,
      packetLinkValues(PACKET, { name: 'Robin Vale' }, { days: 14 }),
      wordingLink('board_packet_link', LINK_URL),
    )
    expect(next).toEqual({
      subject: `Board packet: ${TITLE}`,
      text: `Robin Vale, the packet for the meeting on ${WHEN} is ready. The link expires in 14 days.\n\n${LINK_URL}\n`,
      html: `<p>Robin Vale, the packet for the meeting on ${WHEN} is ready. The link expires in 14 days.</p><p>${linkHtml(LINK_URL)}</p>`,
    })
  })
})

describe('board_packet_updated default', () => {
  const input = { summary: 'The staff report was replaced.', viaLink: true }
  const changed =
    'The packet for the December 15, 2026 meeting changed. The staff report was replaced.'

  it('matches the old message exactly for a reader who came by link', () => {
    const next = renderWording(
      DEFAULT_WORDING.board_packet_updated,
      packetUpdateValues(PACKET, input),
      null,
    )
    expect(next).toEqual({
      subject: `Board packet updated: ${TITLE}`,
      text: `${changed}\n\nOpen the packet from the link in your earlier email.\n`,
      html: `<p>${changed}</p><p>Open the packet from the link in your earlier email.</p>`,
    })
  })

  it('puts the sign-in sentence before the link for a signed-in reader', () => {
    const next = renderWording(
      DEFAULT_WORDING.board_packet_updated,
      packetUpdateValues(PACKET, { ...input, viaLink: false }),
      wordingLink('board_packet_updated', BOARD),
    )
    expect(next.subject).toBe(`Board packet updated: ${TITLE}`)
    expect(next.text).toBe(`${changed}\n\nSign in to read it.\n\n${BOARD}\n`)
  })
})

describe('board_meeting_cancelled default', () => {
  it('matches the old message exactly', () => {
    const next = renderWording(
      DEFAULT_WORDING.board_meeting_cancelled,
      packetCancelValues(PACKET, 'the hearing room is closed'),
      null,
    )
    const line =
      'The December 15, 2026 meeting is cancelled: the hearing room is closed. Its packet is closed and its links no longer work.'
    expect(next).toEqual({
      subject: `Meeting cancelled: ${TITLE}`,
      text: `${line}\n`,
      html: `<p>${line}</p>`,
    })
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
