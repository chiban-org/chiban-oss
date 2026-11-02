import { AppError, ErrorIds } from '@/constants/errorIds'
import type { AbutterStrategy } from '@/features/abutters/types'

const strategies = new Map<string, AbutterStrategy>()

export function registerAbutterStrategy(strategy: AbutterStrategy): void {
  strategies.set(strategy.key, strategy)
}

export function abutterStrategy(key: string): AbutterStrategy {
  const found = strategies.get(key)
  if (found === undefined) {
    throw new AppError(ErrorIds.PACK_UNKNOWN_RULE, 'No such abutter strategy', { key })
  }
  return found
}
