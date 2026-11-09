import { z } from 'zod'
import { COMMON_FIELDS } from '@/features/notifications/wording/wordingFields'
import {
  WORDING_KEY_INFO,
  WORDING_KEYS,
  type WordingKey,
} from '@/features/notifications/wording/wordingKeys'
import { scanTokens } from '@/features/templates/mergeFields'

export const MAX_SUBJECT = 200
export const MAX_BODY = 4000

const TYPED_LINK = /https?:\/\/|www\.|<\s*a[\s>]|mailto:/i

const WordingSchema = z.object({
  subject: z.string().trim().min(1, 'Enter the subject.').max(MAX_SUBJECT),
  body: z.string().trim().min(1, 'Enter the message.').max(MAX_BODY),
})

export const NotificationWordingBodySchema = z
  .object({
    key: z.literal('default'),
    events: z.partialRecord(z.enum(WORDING_KEYS), WordingSchema),
  })
  .superRefine((body, ctx) => {
    for (const [key, wording] of Object.entries(body.events)) {
      for (const issue of wordingIssues(key as WordingKey, wording)) {
        ctx.addIssue({ code: 'custom', path: ['events', key, issue.field], message: issue.message })
      }
    }
  })

export type NotificationWordingBody = z.infer<typeof NotificationWordingBodySchema>

export const EMPTY_NOTIFICATION_WORDING: NotificationWordingBody = { key: 'default', events: {} }

export function allowedFields(key: WordingKey): ReadonlySet<string> {
  const info = new Map(Object.entries(WORDING_KEY_INFO)).get(key)
  return new Set([...COMMON_FIELDS, ...(info?.fields ?? [])])
}

export interface WordingIssue {
  field: 'subject' | 'body'
  message: string
}

function unknownFields(key: WordingKey, source: string, field: 'subject' | 'body'): string[] {
  const allowed = allowedFields(key)
  return scanTokens(source)
    .map((t) => t.name)
    .filter((name) => !allowed.has(name) || (field === 'subject' && name === 'link'))
}

export function wordingIssues(
  key: WordingKey,
  wording: { subject: string; body: string },
): WordingIssue[] {
  const issues: WordingIssue[] = []
  for (const [field, source] of [
    ['subject', wording.subject],
    ['body', wording.body],
  ] as const) {
    if (TYPED_LINK.test(source)) {
      issues.push({
        field,
        message:
          'Leave web addresses out. Chiban adds the link itself, and {{link}} places it in the message.',
      })
    }
    const unknown = [...new Set(unknownFields(key, source, field))]
    if (unknown.length > 0) {
      issues.push({
        field,
        message: `This message cannot use ${unknown.map((n) => `{{${n}}}`).join(', ')}. Pick a field from the list.`,
      })
    }
  }
  return issues
}
