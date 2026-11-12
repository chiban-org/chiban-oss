import { describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import {
  cancelledPacketMail,
  linkPacketMail,
  memberPacketMail,
  updatePacketMail,
} from '@/features/boards/packetMail'
import { claimMessage } from '@/features/contractors/claimMessage'
import type { MailMessage, MailTransport } from '@/features/mail/transport'
import {
  boardMemberValues,
  boardPacketValues,
  claimValues,
  packetCancelValues,
  packetLinkValues,
  packetUpdateValues,
  releaseValues,
  requestLetterValues,
  requestReceiptValues,
  wordingLink,
} from '@/features/notifications/wording/externalValues'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'
import { sendReleaseFiles, sendReleaseLink } from '@/features/rtk/releaseMail'
import { ok } from '@/types/result'

const PACKET = {
  title: 'Alder Pond Zoning Board of Adjustment packet, December 15, 2026',
  meetingDate: '2026-12-15',
  place: { startsAtMinute: 1140, location: 'Town Hall, Meeting Room 2' },
}
const UNDATED = { ...PACKET, title: 'April agenda', place: null }
const BOARD = `${env.BASE_URL}/board`

function sentBy(run: (mail: MailTransport) => Promise<boolean>): Promise<MailMessage | undefined> {
  const sent: MailMessage[] = []
  const mail: MailTransport = {
    send(message) {
      sent.push(message)
      return Promise.resolve(ok(undefined))
    },
  }
  return run(mail).then(() => sent[0])
}

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

describe('project_claim default', () => {
  it('matches claimMessage in subject and text', () => {
    const input = {
      to: 'robin@example.org',
      name: 'Robin Vale',
      role: 'contractor',
      title: 'Garage addition',
      link: 'https://town.example/claim/abc',
      days: 14,
      townName: 'Town of Alder Pond',
    } as const
    const old = claimMessage(input)
    const next = renderWording(
      DEFAULT_WORDING.project_claim,
      claimValues(input),
      wordingLink('project_claim', input.link),
    )
    expect(next).toEqual({ subject: old.subject, text: old.text, html: old.html })
  })
})

describe('rtk_request_received default', () => {
  it('matches the receipt text', () => {
    const next = renderWording(
      DEFAULT_WORDING.rtk_request_received,
      requestReceiptValues({
        number: 'RTK-2026-0012',
        receivedOn: '2026-11-09',
        due: '2026-11-16',
      }),
      wordingLink('rtk_request_received', env.BASE_URL),
    )
    expect(next.subject).toBe('Right-to-Know request RTK-2026-0012 received')
    expect(next.text).toBe(
      `${[
        'The town received your Right-to-Know request on November 9, 2026. Its number is RTK-2026-0012.',
        'The town will answer by November 16, 2026. It will make the records available, deny the request in writing, or tell you in writing when it will answer.',
        'Keep the request number if you need to ask about it.',
      ].join('\n\n')}\n\n${env.BASE_URL}\n`,
    )
    expect(next.html).toContain('<p>Keep the request number if you need to ask about it.</p>')
  })
})

describe('rtk_letter_sent default', () => {
  it('matches the letter email text', () => {
    const next = renderWording(
      DEFAULT_WORDING.rtk_letter_sent,
      requestLetterValues('RTK-2026-0012'),
      null,
    )
    expect(next.subject).toBe('Letter about Right-to-Know request RTK-2026-0012')
    expect(next.text).toBe(
      "The town's letter about your Right-to-Know request RTK-2026-0012 is attached.\n",
    )
    expect(next.html).toBe(
      '<p>The town&#39;s letter about your Right-to-Know request RTK-2026-0012 is attached.</p>',
    )
  })
})

describe('release defaults', () => {
  const base = { to: 'req@example.org', number: 'RTK-2026-0012', releasedOn: '2026-11-12' }

  for (const flags of [{}, { tooLarge: true }, { reissued: true }]) {
    it(`rtk_records_link matches sendReleaseLink ${JSON.stringify(flags)}`, async () => {
      const old = await sentBy((mail) =>
        sendReleaseLink(
          mail,
          { ...base, attachments: [], token: 'tok', ...flags },
          new AbortController().signal,
        ),
      )
      const link = `${env.BASE_URL}/records/releases/tok`
      const next = renderWording(
        DEFAULT_WORDING.rtk_records_link,
        releaseValues({ ...base, ...flags }, 30),
        wordingLink('rtk_records_link', link),
      )
      expect(next.subject).toBe(old?.subject)
      expect(next.text).toBe(old?.text)
      expect(next.html).toBe(old?.html)
    })
  }

  it('rtk_records_attached matches sendReleaseFiles', async () => {
    const old = await sentBy((mail) =>
      sendReleaseFiles(mail, { ...base, attachments: [] }, new AbortController().signal),
    )
    const next = renderWording(DEFAULT_WORDING.rtk_records_attached, releaseValues(base, 30), null)
    expect(next.subject).toBe(old?.subject)
    expect(next.text).toBe(old?.text)
    expect(next.html).toBe(old?.html.replace("town's", 'town&#39;s'))
  })
})
