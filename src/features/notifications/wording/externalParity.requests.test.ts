import { describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { claimMessage } from '@/features/contractors/claimMessage'
import type { MailMessage, MailTransport } from '@/features/mail/transport'
import {
  claimValues,
  releaseValues,
  requestLetterValues,
  requestReceiptValues,
  wordingLink,
} from '@/features/notifications/wording/externalValues'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'
import { sendReleaseFiles, sendReleaseLink } from '@/features/rtk/releaseMail'
import { ok } from '@/types/result'

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
