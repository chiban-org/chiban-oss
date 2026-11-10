import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { vi } from 'vitest'
import type { SeedDemoDeps } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'

export const DEMO_SEED_INSTANT = new Date('2026-11-05T16:00:00Z')

export function useDemoStoryClock(): void {
  vi.useFakeTimers({ toFake: ['Date'], now: DEMO_SEED_INSTANT, shouldAdvanceTime: true })
}

export async function demoSeedDeps(): Promise<SeedDemoDeps> {
  const base = await mkdtemp(path.join(tmpdir(), 'demo-seed-'))
  return {
    records: { mail: createMemoryTransport() },
    operations: {
      exportDir: path.join(base, 'exports'),
      legacySourceDir: path.join(base, 'legacy'),
      mail: createMemoryTransport(),
    },
  }
}
