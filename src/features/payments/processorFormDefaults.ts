import type { ProcessorAccountSummary } from '@/features/payments/processorAccounts'

export interface ProcessorFormDefaults {
  processor: string
  mode: string
  accountRef: string
  apiBase: string
  ecommBase: string
  deviceId: string
}

const SETTING_KEYS = ['apiBase', 'ecommBase', 'deviceId'] as const

function setting(settings: Record<string, unknown>, key: (typeof SETTING_KEYS)[number]): string {
  const value = new Map(Object.entries(settings)).get(key)
  return typeof value === 'string' ? value : ''
}

export function processorFormDefaults(
  accounts: readonly ProcessorAccountSummary[],
): ProcessorFormDefaults | null {
  const active = accounts.find((a) => a.isActive)
  if (active === undefined) return null
  return {
    processor: active.processor,
    mode: active.mode,
    accountRef: active.accountRef,
    apiBase: setting(active.settings, 'apiBase'),
    ecommBase: setting(active.settings, 'ecommBase'),
    deviceId: setting(active.settings, 'deviceId'),
  }
}
