import { computeConvenienceFee } from '@/features/payments/convenienceFee'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'
import { formatCents } from '@/lib/money'

const EXAMPLE_CENTS = 10_000

export function convenienceExample(fee: PaymentSettingsBody['convenienceFee']): string {
  if (fee.appliesTo.length === 0) return 'No convenience fee is charged.'
  const channel = fee.appliesTo[0] ?? 'card_online'
  const extra = computeConvenienceFee(EXAMPLE_CENTS, fee, channel)
  return `On a ${formatCents(EXAMPLE_CENTS)} card payment the payer pays ${formatCents(extra)} more, ${formatCents(EXAMPLE_CENTS + extra)} in all.`
}
