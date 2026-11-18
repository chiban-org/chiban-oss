import { activePack } from '@/features/packs/registry'
import type { LockedSourceKey } from '@/features/templates/doc/lockedSources'

export function lockedTexts(): Partial<Record<LockedSourceKey, string>> {
  const texts = activePack().orderTexts
  return {
    'order.ceaseSentence': texts.ceaseSentence,
    'order.motionNotice': texts.motionNotice,
    'order.lienWarning': texts.lienWarning,
  }
}
