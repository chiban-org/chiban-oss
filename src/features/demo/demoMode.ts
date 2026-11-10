import { env } from '@/config/env'
import { demoNoticeFor } from '@/features/demo/demoCopy'

export { DEMO_REFUSAL } from '@/features/demo/demoCopy'

export function isDemoMode(): boolean {
  return env.CHIBAN_DEMO_MODE
}

export function demoNotice(): string | null {
  if (!env.CHIBAN_DEMO_MODE) return null
  return demoNoticeFor(env.CHIBAN_DEMO_RESET_AT ?? 'night')
}

export const DEMO_LOCKED_CONFIG_KINDS: readonly string[] = [
  'town_profile',
  'payment_settings',
  'notification_wording',
]

export function isLockedConfigKind(kind: string): boolean {
  return env.CHIBAN_DEMO_MODE && DEMO_LOCKED_CONFIG_KINDS.includes(kind)
}
