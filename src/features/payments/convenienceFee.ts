import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'

const BASIS_POINTS_PER_UNIT = 10_000

export type PaymentChannel = 'card_online' | 'card_present' | 'cash' | 'check'

export function computeConvenienceFee(
  baseCents: number,
  fee: PaymentSettingsBody['convenienceFee'],
  channel: PaymentChannel,
): number {
  if (channel === 'cash' || channel === 'check') return 0
  if (!fee.appliesTo.includes(channel)) return 0
  const proportional = Math.floor(
    (baseCents * fee.basisPoints * 2 + BASIS_POINTS_PER_UNIT) / (BASIS_POINTS_PER_UNIT * 2),
  )
  return proportional + fee.fixedCents
}
