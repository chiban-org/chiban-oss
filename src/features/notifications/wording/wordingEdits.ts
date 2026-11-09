import { DEFAULT_WORDING, type Wording } from '@/features/notifications/wording/wordingDefaults'
import type { WordingKey } from '@/features/notifications/wording/wordingKeys'
import type { NotificationWordingBody } from '@/features/notifications/wording/wordingSchema'

function overrideOf(body: NotificationWordingBody, key: WordingKey): Wording | undefined {
  return new Map(Object.entries(body.events)).get(key)
}

function defaultOf(key: WordingKey): Wording {
  return new Map(Object.entries(DEFAULT_WORDING)).get(key) ?? { subject: '', body: '' }
}

export function isChanged(body: NotificationWordingBody, key: WordingKey): boolean {
  return overrideOf(body, key) !== undefined
}

export function currentWording(body: NotificationWordingBody, key: WordingKey): Wording {
  return overrideOf(body, key) ?? defaultOf(key)
}

export function withWording(
  body: NotificationWordingBody,
  key: WordingKey,
  change: Partial<Wording>,
): NotificationWordingBody {
  const next = { ...currentWording(body, key), ...change }
  const same = next.subject === defaultOf(key).subject && next.body === defaultOf(key).body
  return same ? withDefault(body, key) : { ...body, events: { ...body.events, [key]: next } }
}

export function withDefault(
  body: NotificationWordingBody,
  key: WordingKey,
): NotificationWordingBody {
  return {
    ...body,
    events: Object.fromEntries(Object.entries(body.events).filter(([k]) => k !== key)),
  }
}

export function insertField(
  text: string,
  at: number,
  field: string,
): { text: string; caret: number } {
  const token = `{{${field}}}`
  const cut = Math.max(0, Math.min(at, text.length))
  return { text: text.slice(0, cut) + token + text.slice(cut), caret: cut + token.length }
}
