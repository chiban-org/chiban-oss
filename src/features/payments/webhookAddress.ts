import { env } from '@/config/env'
import type { Processor } from '@/features/ledger/types'
import { MISSING_WEBHOOK_SECRET } from '@/features/payments/processorAccounts'

export type WebhookView =
  | { state: 'unsaved' }
  | { state: 'not_needed' }
  | { state: 'ready'; address: string; receiving: boolean }

export function webhookAddress(accountId: string, baseUrl: string = env.BASE_URL): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/payments/webhooks/${accountId}`
}

export function webhookView(
  account: { id: string; processor: Processor; webhookSecret: string } | null,
  baseUrl: string = env.BASE_URL,
): WebhookView {
  if (account === null) return { state: 'unsaved' }
  if (account.processor === 'simulated') return { state: 'not_needed' }
  return {
    state: 'ready',
    address: webhookAddress(account.id, baseUrl),
    receiving: account.webhookSecret !== MISSING_WEBHOOK_SECRET,
  }
}
