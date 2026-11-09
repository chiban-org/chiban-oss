import { describe, expect, it } from 'vitest'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'
import {
  NotificationWordingBodySchema,
  wordingIssues,
} from '@/features/notifications/wording/wordingSchema'

const LINK = { href: 'https://town.example/portal/applications/a1', label: 'Open the application' }

describe('notification wording', () => {
  it('escapes staff text and merge values in the HTML but not in the text', () => {
    const rendered = renderWording(
      { subject: 'Hello {{applicant.name}}', body: 'Dear {{applicant.name}} & co.' },
      { 'applicant.name': '<b>Jo</b>' },
      LINK,
    )
    expect(rendered.subject).toBe('Hello <b>Jo</b>')
    expect(rendered.text).toContain('Dear <b>Jo</b> & co.')
    expect(rendered.html).toContain('Dear &lt;b&gt;Jo&lt;/b&gt; &amp; co.')
    expect(rendered.html).not.toContain('<b>')
  })

  it('appends the link Chiban builds when the message does not place it', () => {
    const rendered = renderWording({ subject: 'S', body: 'One.\n\nTwo.' }, {}, LINK)
    expect(rendered.text).toBe(`One.\n\nTwo.\n\n${LINK.href}\n`)
    expect(rendered.html).toBe(
      `<p>One.</p><p>Two.</p><p><a href="${LINK.href}">Open the application</a></p>`,
    )
  })

  it('places the link where the message puts {{link}} and does not repeat it', () => {
    const rendered = renderWording({ subject: 'S', body: 'Go to {{link}} now.' }, {}, LINK)
    expect(rendered.text).toBe(`Go to ${LINK.href} now.\n`)
    expect(rendered.html).toBe(`<p>Go to <a href="${LINK.href}">${LINK.href}</a> now.</p>`)
  })

  it('leaves out a paragraph none of whose fields has a value', () => {
    const rendered = renderWording(DEFAULT_WORDING.board_comment_requested, {}, LINK)
    expect(rendered.text).not.toContain('Comments by')
    const dated = renderWording(
      DEFAULT_WORDING.board_comment_requested,
      { 'comments.by': 'November 20, 2026' },
      LINK,
    )
    expect(dated.text).toContain('Comments by November 20, 2026.')
  })

  it('keeps the account note after the staff wording', () => {
    const rendered = renderWording({ subject: 'S', body: 'Body.' }, {}, { ...LINK, note: 'Note.' })
    expect(rendered.text).toBe(`Body.\n\nNote.\n\n${LINK.href}\n`)
  })

  it('refuses typed web addresses, links in the subject and fields the message cannot use', () => {
    expect(
      wordingIssues('fees_due', { subject: 'Pay', body: 'Pay at https://evil.example' }),
    ).toEqual([{ field: 'body', message: expect.stringContaining('Leave web addresses out') }])
    expect(wordingIssues('fees_due', { subject: 'Pay {{link}}', body: 'Pay.' })[0]?.field).toBe(
      'subject',
    )
    expect(
      wordingIssues('fees_due', { subject: 'Pay', body: 'Inspection {{inspection.date}}' })[0]
        ?.message,
    ).toContain('{{inspection.date}}')
    expect(
      wordingIssues('fees_due', { subject: 'Fees {{fees.amount}}', body: 'Pay {{link}}.' }),
    ).toEqual([])
  })

  it('validates a stored wording body by event', () => {
    const bad = NotificationWordingBodySchema.safeParse({
      key: 'default',
      events: { fees_due: { subject: 'Pay', body: '<a href="x">pay</a>' } },
    })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues[0]?.path).toEqual(['events', 'fees_due', 'body'])
    const good = NotificationWordingBodySchema.safeParse({
      key: 'default',
      events: { fees_due: { subject: 'Pay {{fees.amount}}', body: 'Please pay.' } },
    })
    expect(good.success).toBe(true)
  })

  it('accepts every default wording as valid', () => {
    for (const [key, wording] of Object.entries(DEFAULT_WORDING)) {
      expect(wordingIssues(key as keyof typeof DEFAULT_WORDING, wording), key).toEqual([])
    }
  })
})
