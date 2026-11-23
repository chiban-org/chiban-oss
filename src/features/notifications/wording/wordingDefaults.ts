import { WORDING_KEYS, type WordingKey } from '@/features/notifications/wording/wordingKeys'
import { defaultWordingFor, type Wording } from '@/features/notifications/wording/wordingStandard'
import { acknowledgementEnabled, packVocabulary } from '@/features/packs/vocabulary'

export { defaultWordingFor, type Wording } from '@/features/notifications/wording/wordingStandard'

export const DEFAULT_WORDING = Object.defineProperties(
  {},
  Object.fromEntries(
    WORDING_KEYS.map((key) => [
      key,
      {
        enumerable: true,
        get: () =>
          defaultWordingFor({
            ...packVocabulary(),
            recordsAcknowledgement: acknowledgementEnabled(),
          })[key],
      },
    ]),
  ),
) as Record<WordingKey, Wording>
