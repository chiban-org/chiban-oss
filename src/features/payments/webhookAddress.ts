import { env } from '@/config/env'

export function webhookAddress(accountId: string, baseUrl: string = env.BASE_URL): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/payments/webhooks/${accountId}`
}
