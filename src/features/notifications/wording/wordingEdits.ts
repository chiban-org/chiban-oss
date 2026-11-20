import {
  currentWording as currentWordingIn,
  withWording as withWordingIn,
  wordingFor as wordingForIn,
} from '@/features/notifications/wording/wordingChanges'
import type { Wording } from '@/features/notifications/wording/wordingDefaults'
import type { WordingKey } from '@/features/notifications/wording/wordingKeys'
import type {
  NotificationWordingBody,
  WordingOverrides,
} from '@/features/notifications/wording/wordingSchema'
import { packVocabulary } from '@/features/packs/vocabulary'

export {
  insertField,
  isChanged,
  withDefault,
} from '@/features/notifications/wording/wordingChanges'

export function wordingFor(key: WordingKey, overrides: WordingOverrides | undefined): Wording {
  return wordingForIn(key, overrides, packVocabulary())
}

export function currentWording(body: NotificationWordingBody, key: WordingKey): Wording {
  return currentWordingIn(body, key, packVocabulary())
}

export function withWording(
  body: NotificationWordingBody,
  key: WordingKey,
  change: Partial<Wording>,
): NotificationWordingBody {
  return withWordingIn(body, key, change, packVocabulary())
}
