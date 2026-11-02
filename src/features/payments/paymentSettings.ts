import type { DbOrTx } from '@/db/client'
import { getPublished } from '@/features/config/store'
import { NO_CONVENIENCE_FEE, type PaymentSettingsBody } from '@/features/payments/settingsSchema'

const DEFAULT_SETTINGS: PaymentSettingsBody = {
  key: 'default',
  convenienceFee: NO_CONVENIENCE_FEE,
  receiptFooter: '',
  checksPayableTo: 'the Town',
}

export async function getPaymentSettings(
  db: DbOrTx,
  signal: AbortSignal,
): Promise<PaymentSettingsBody> {
  const published = await getPublished(db, 'payment_settings', 'default', signal)
  return published === null ? DEFAULT_SETTINGS : (published.body as PaymentSettingsBody)
}
