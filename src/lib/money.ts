const CENTS_PER_DOLLAR = 100

export function formatCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / CENTS_PER_DOLLAR)
  const rest = String(abs % CENTS_PER_DOLLAR).padStart(2, '0')
  return `${negative ? '-' : ''}$${dollars.toLocaleString('en-US')}.${rest}`
}

const DIGITS = /^\d+$/

export function dollarsToCents(text: string): number | null {
  const trimmed = text.trim()
  const [whole = '', fraction = '', ...extra] = trimmed.split('.')
  const fractionOk = trimmed.includes('.')
    ? DIGITS.test(fraction) && fraction.length <= 2
    : fraction === ''
  if (extra.length > 0 || !DIGITS.test(whole) || !fractionOk) return null
  return Number(whole) * CENTS_PER_DOLLAR + Number(fraction.padEnd(2, '0'))
}

export function centsToDollarInput(cents: number): string {
  return `${Math.floor(cents / CENTS_PER_DOLLAR)}.${String(cents % CENTS_PER_DOLLAR).padStart(2, '0')}`
}
