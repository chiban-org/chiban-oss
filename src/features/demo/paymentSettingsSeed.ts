import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'

export const PAYMENT_SETTINGS_SEED: PaymentSettingsBody = {
  key: 'default',
  convenienceFee: { basisPoints: 300, fixedCents: 0, appliesTo: ['card_online', 'card_present'] },
  receiptFooter: 'Thank you. Questions about this receipt: Land Use Office, Town of Alder Pond.',
  checksPayableTo: 'Town of Alder Pond',
}
