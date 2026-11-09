import { DEFAULT_WORDING, type Wording } from '@/features/notifications/wording/wordingDefaults'
import type { WordingKey } from '@/features/notifications/wording/wordingKeys'
import type {
  NotificationWordingBody,
  WordingOverrides,
} from '@/features/notifications/wording/wordingSchema'

const DEFAULTS = new Map<string, Wording>(Object.entries(DEFAULT_WORDING))

function overrideOf(overrides: WordingOverrides, key: WordingKey): Wording | undefined {
  return new Map(Object.entries(overrides)).get(key)
}

function defaultOf(key: WordingKey): Wording {
  return DEFAULTS.get(key) ?? { subject: '', body: '' }
}

export function wordingFor(key: WordingKey, overrides: WordingOverrides | undefined): Wording {
  return (overrides === undefined ? undefined : overrideOf(overrides, key)) ?? defaultOf(key)
}

export function isChanged(body: NotificationWordingBody, key: WordingKey): boolean {
  return overrideOf(body.events, key) !== undefined
}

export function currentWording(body: NotificationWordingBody, key: WordingKey): Wording {
  return wordingFor(key, body.events)
}

export function withWording(
  body: NotificationWordingBody,
  key: WordingKey,
  change: Partial<Wording>,
): NotificationWordingBody {
  const next = { ...currentWording(body, key), ...change }
  const standard = defaultOf(key)
  const same = next.subject === standard.subject && next.body === standard.body
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
