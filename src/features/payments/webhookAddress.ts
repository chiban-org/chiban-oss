import { env } from '@/config/env'
import type { Processor } from '@/features/ledger/types'

export type WebhookView =
  | { state: 'unsaved' }
  | { state: 'not_needed' }
  | { state: 'ready'; address: string }

export function webhookAddress(accountId: string, baseUrl: string = env.BASE_URL): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/payments/webhooks/${accountId}`
}

export function webhookView(
  account: { id: string; processor: Processor } | null,
  baseUrl: string = env.BASE_URL,
): WebhookView {
  if (account === null) return { state: 'unsaved' }
  if (account.processor === 'simulated') return { state: 'not_needed' }
  return { state: 'ready', address: webhookAddress(account.id, baseUrl) }
}
