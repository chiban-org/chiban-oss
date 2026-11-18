import { NH_PACK } from '@packs/nh'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { StatePack } from '@/features/packs/schema'

export const DEFAULT_PACK_ID = 'nh'

const PACKS: Readonly<Record<string, StatePack>> = { nh: NH_PACK }

let selected: StatePack | null = null
let testOverride: StatePack | null = null

export function packIdFromEnv(env: Readonly<Record<string, string | undefined>>): string {
  const raw = env.CHIBAN_PACK?.trim() ?? ''
  return raw === '' ? DEFAULT_PACK_ID : raw
}

export function packById(id: string): StatePack {
  const pack = Object.hasOwn(PACKS, id) ? PACKS[id] : undefined
  if (pack === undefined) {
    throw new AppError(ErrorIds.PACK_INVALID, 'No jurisdiction pack has this id', {
      id,
      known: Object.keys(PACKS),
    })
  }
  return pack
}

export function activePack(): StatePack {
  if (testOverride !== null) return testOverride
  selected ??= packById(packIdFromEnv(process.env))
  return selected
}

export function setActivePackForTest(pack: StatePack | null): void {
  testOverride = pack
  selected = null
}

export function withPackForTest<T>(pack: StatePack, run: () => T): T {
  const previous = testOverride
  testOverride = pack
  try {
    return run()
  } finally {
    testOverride = previous
  }
}
