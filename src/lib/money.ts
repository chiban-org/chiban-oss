const CENTS_PER_DOLLAR = 100

export function formatCents(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / CENTS_PER_DOLLAR)
  const rest = String(abs % CENTS_PER_DOLLAR).padStart(2, '0')
  return `${negative ? '-' : ''}$${dollars.toLocaleString('en-US')}.${rest}`
}
