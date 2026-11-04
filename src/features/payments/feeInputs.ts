import { computeConvenienceFee } from '@/features/payments/convenienceFee'
import type { PaymentSettingsBody } from '@/features/payments/settingsSchema'
import { dollarsToCents, formatCents } from '@/lib/money'

export type FeeInputs =
  | { ok: true; basisPoints: number; fixedCents: number }
  | { ok: false; field: 'percent' | 'fixedDollars'; message: string }

const DIGITS = /^\d+$/

function isPercent(text: string): boolean {
  const [whole = '', fraction, ...extra] = text.split('.')
  if (extra.length > 0 || !DIGITS.test(whole)) return false
  if (fraction !== undefined && (!DIGITS.test(fraction) || fraction.length > 2)) return false
  return Number(text) <= 100
}

export function parseFeeInputs(percent: string, dollars: string): FeeInputs {
  const p = percent.trim() === '' ? '0' : percent.trim()
  if (!isPercent(p)) {
    return {
      ok: false,
      field: 'percent',
      message: 'Enter the percent as a number from 0 to 100, such as 2.5.',
    }
  }
  const cents = dollarsToCents(dollars.trim() === '' ? '0' : dollars.replace('$', ''))
  if (cents === null) {
    return {
      ok: false,
      field: 'fixedDollars',
      message: 'Enter the set amount in dollars and cents, such as 0.30.',
    }
  }
  const [whole = '0', fraction = ''] = p.split('.')
  return {
    ok: true,
    basisPoints: Number(whole) * 100 + Number(fraction.padEnd(2, '0')),
    fixedCents: cents,
  }
}

export function percentText(basisPoints: number): string {
  return String(basisPoints / 100)
}

const EXAMPLE_CENTS = 10_000

export function convenienceExample(fee: PaymentSettingsBody['convenienceFee']): string {
  if (fee.appliesTo.length === 0) return 'No convenience fee is charged.'
  const channel = fee.appliesTo[0] ?? 'card_online'
  const extra = computeConvenienceFee(EXAMPLE_CENTS, fee, channel)
  return `On a ${formatCents(EXAMPLE_CENTS)} card payment the payer pays ${formatCents(extra)} more, ${formatCents(EXAMPLE_CENTS + extra)} in all.`
}
