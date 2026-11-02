import { AppError, ErrorIds } from '@/constants/errorIds'

export interface Weight {
  key: string
  cents: number
}

export function prorate(totalCents: number, weights: Weight[]): Weight[] {
  const sum = weights.reduce((acc, w) => acc + BigInt(w.cents), 0n)
  if (sum <= 0n) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'Cannot prorate over zero weight', { totalCents })
  }
  const total = BigInt(totalCents)
  const floors = weights.map((w) => ({
    key: w.key,
    cents: (total * BigInt(w.cents)) / sum,
    remainder: (total * BigInt(w.cents)) % sum,
  }))
  let leftover = Number(total - floors.reduce((acc, f) => acc + f.cents, 0n))
  const byRemainder = floors
    .map((f, index) => ({ f, index }))
    .sort((a, b) => {
      if (a.f.remainder === b.f.remainder) return a.index - b.index
      return a.f.remainder > b.f.remainder ? -1 : 1
    })
  for (const { f } of byRemainder) {
    if (leftover === 0) break
    f.cents += 1n
    leftover -= 1
  }
  return floors.map((f) => ({ key: f.key, cents: Number(f.cents) }))
}
