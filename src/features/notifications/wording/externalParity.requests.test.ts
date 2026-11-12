import { describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import {
  claimValues,
  releaseValues,
  requestLetterValues,
  requestReceiptValues,
  wordingLink,
} from '@/features/notifications/wording/externalValues'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'

describe('project_claim default', () => {
  it('matches the pinned claim email', () => {
    const input = {
      name: 'Robin Vale',
      role: 'contractor',
      title: 'Garage addition',
      days: 14,
      townName: 'Town of Alder Pond',
    } as const
    const next = renderWording(
      DEFAULT_WORDING.project_claim,
      claimValues(input),
      wordingLink('project_claim', 'https://town.example/claim/abc'),
    )
    expect(next).toEqual({
      subject: 'Claim your project in Chiban: Garage addition',
      text: 'Robin Vale, you were named as a contractor on a project at the Town of Alder Pond.\n\nUse this link to claim the project and follow its permits. It works once and expires in 14 days.\n\nhttps://town.example/claim/abc\n',
      html: '<p>Robin Vale, you were named as a contractor on a project at the Town of Alder Pond.</p><p>Use this link to claim the project and follow its permits. It works once and expires in 14 days.</p><p><a href="https://town.example/claim/abc">Claim the project</a></p>',
    })
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
  const base = { number: 'RTK-2026-0012', releasedOn: '2026-11-12' }
  const released =
    'The town released records for your Right-to-Know request RTK-2026-0012 on November 12, 2026.'
  const notes = {
    plain: '',
    tooLarge: ' The files were too large to attach to an email, so they are at this link instead.',
    reissued: ' The earlier link has expired, so here is a new one.',
  }
  const flagsOf = {
    plain: {},
    tooLarge: { tooLarge: true },
    reissued: { reissued: true },
  } as const

  for (const name of ['plain', 'tooLarge', 'reissued'] as const) {
    it(`rtk_records_link matches the pinned link email, ${name}`, () => {
      const link = `${env.BASE_URL}/records/releases/tok`
      const next = renderWording(
        DEFAULT_WORDING.rtk_records_link,
        releaseValues({ ...base, ...flagsOf[name] }, 30),
        wordingLink('rtk_records_link', link),
      )
      const lead = `${released}${notes[name]} The link works for 30 days.`
      expect(next.subject).toBe('Records for request RTK-2026-0012')
      expect(next.text).toBe(`${lead}\n\n${link}\n`)
      expect(next.html).toBe(`<p>${lead}</p><p><a href="${link}">Open the records</a></p>`)
    })
  }

  it('rtk_records_attached matches the pinned attached email', () => {
    const next = renderWording(DEFAULT_WORDING.rtk_records_attached, releaseValues(base, 30), null)
    expect(next.subject).toBe('Records for request RTK-2026-0012')
    expect(next.text).toBe(`${released} The records and the town's letter are attached.\n`)
    expect(next.html).toBe(`<p>${released} The records and the town&#39;s letter are attached.</p>`)
  })
})
