import { describe, expect, it } from 'vitest'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { DEFAULT_WORDING } from '@/features/notifications/wording/wordingDefaults'
import { WORDING_KEY_INFO, WORDING_KEYS } from '@/features/notifications/wording/wordingKeys'
import {
  allowedFields,
  NotificationWordingBodySchema,
  wordingIssues,
} from '@/features/notifications/wording/wordingSchema'

const LINK = { href: 'https://town.example/board', label: 'Open the board pages' }

const EXISTING_OVERRIDES = {
  application_submitted: ['Received {{application.number}}', 'Hello {{applicant.name}}, {{link}}'],
  fees_due: ['Fees {{fees.amount}}', '{{applicant.name}} owes {{fees.amount}} to {{town.name}}.'],
  payment_received: ['Receipt {{receipt.number}}', 'Paid for {{application.number}}.'],
  application_issued: ['Issued {{application.number}}', 'Download it {{account.from}}.'],
  application_denied: ['Denied {{application.number}}', 'Sorry, {{applicant.name}}.'],
  inspection_scheduled: [
    '{{inspection.type}} {{inspection.date}}',
    'At {{inspection.time}} for {{application.number}}.',
  ],
  inspection_cancelled: ['Cancelled {{inspection.type}}', 'See {{application.number}}.'],
  inspection_result: ['{{inspection.result}}', '{{inspection.type}} for {{application.number}}.'],
  permit_corrected: [
    'Corrected {{application.number}}',
    'Revision {{permit.revision}} {{account.in}}.',
  ],
  permit_corrected_contractor_removed: [
    'Corrected {{application.number}}',
    'Revision {{permit.revision}}.',
  ],
  review_assigned: ['Review {{application.number}}', 'Please review for {{applicant.name}}.'],
  board_comment_requested: [
    'Comments {{application.number}}',
    '{{board.name}} on {{project.title}} by {{comments.by}}.',
  ],
  clock_due_soon: ['{{clock.name}}', '{{application.number}} due {{clock.due}}.'],
  clock_overdue: ['{{clock.name}}', '{{application.number}} was due {{clock.due}}.'],
  decision_filed: [
    '{{decision.outcome}}',
    '{{board.name}} filed on {{decision.filedOn}} {{account.from}} for {{application.number}}.',
  ],
} as const

const NEW_KEYS = WORDING_KEYS.slice(15)

describe('saved overrides for the original messages', () => {
  it('still parse against the per-message field lists', () => {
    const events = Object.fromEntries(
      Object.entries(EXISTING_OVERRIDES).map(([key, [subject, body]]) => [key, { subject, body }]),
    )
    expect(Object.keys(events)).toHaveLength(15)
    const parsed = NotificationWordingBodySchema.safeParse({ key: 'default', events })
    expect(parsed.success).toBe(true)
  })

  it('keeps application fields on every original message', () => {
    for (const key of WORDING_KEYS.slice(0, 15)) {
      expect(allowedFields(key).has('application.number'), key).toBe(true)
      expect(allowedFields(key).has('applicant.name'), key).toBe(true)
      expect(allowedFields(key).has('link'), key).toBe(true)
    }
  })
})

describe('new messages', () => {
  it('accept every default', () => {
    expect(NEW_KEYS).toHaveLength(10)
    for (const key of NEW_KEYS) expect(wordingIssues(key, DEFAULT_WORDING[key]), key).toEqual([])
  })

  it('refuse application fields', () => {
    for (const key of NEW_KEYS) {
      const issues = wordingIssues(key, {
        subject: 'S',
        body: `${DEFAULT_WORDING[key].body} {{application.number}}`,
      })
      expect(issues.map((i) => i.message).join(' '), key).toContain('{{application.number}}')
    }
  })

  it('refuse the link on messages without one', () => {
    const none = NEW_KEYS.filter((k) => WORDING_KEY_INFO[k].link === 'none')
    expect(none).toEqual(['board_meeting_cancelled', 'rtk_letter_sent', 'rtk_records_attached'])
    for (const key of none) {
      const issues = wordingIssues(key, {
        subject: DEFAULT_WORDING[key].subject,
        body: `${DEFAULT_WORDING[key].body}\n\n{{link}}`,
      })
      expect(issues.map((i) => i.message).join(' '), key).toContain('{{link}}')
      expect(allowedFields(key).has('link')).toBe(false)
    }
  })

  it('refuse a body that leaves out a required field, naming it', () => {
    expect(
      wordingIssues('rtk_request_received', {
        subject: 'Request {{request.number}}',
        body: 'Received.',
      }),
    ).toEqual([{ field: 'body', message: 'This message must include {{request.due}}.' }])
    expect(
      wordingIssues('rtk_records_link', { subject: 'Records', body: 'Ready at {{link}}.' }),
    ).toEqual([{ field: 'body', message: 'This message must include {{link.days}}.' }])
    expect(
      wordingIssues('project_claim', { subject: 'Claim', body: 'Claim it.' })[0]?.message,
    ).toBe('This message must include {{link.days}}.')
    expect(
      wordingIssues('board_packet_link', { subject: 'Packet', body: 'Read it.' })[0]?.message,
    ).toBe('This message must include {{link.days}}.')
  })

  it('counts a required field placed in the subject', () => {
    expect(
      wordingIssues('rtk_request_received', {
        subject: 'Request {{request.number}} due {{request.due}}',
        body: 'Received.',
      }),
    ).toEqual([])
  })
})

describe('renderWording link modes', () => {
  it('appends nothing without a link', () => {
    const rendered = renderWording(
      DEFAULT_WORDING.board_meeting_cancelled,
      { 'meeting.reason': 'closed' },
      null,
    )
    expect(rendered.text.endsWith('no longer work.\n')).toBe(true)
    expect(rendered.html).not.toContain('<a')
  })

  it('drops a link-only paragraph and appends nothing when an optional link is empty', () => {
    const wording = { subject: 'S', body: 'Changed.\n\n{{link}}' }
    const without = renderWording(wording, {}, null)
    expect(without.text).toBe('Changed.\n')
    expect(without.html).toBe('<p>Changed.</p>')
    const emptyHref = renderWording(wording, {}, { ...LINK, href: '' })
    expect(emptyHref).toEqual(without)
  })

  it('appends the link when an optional message has one', () => {
    const rendered = renderWording(DEFAULT_WORDING.board_packet_updated, {}, LINK)
    expect(rendered.text.endsWith(`\n\n${LINK.href}\n`)).toBe(true)
    expect(
      rendered.html.endsWith('<a href="https://town.example/board">Open the board pages</a></p>'),
    ).toBe(true)
  })
})
