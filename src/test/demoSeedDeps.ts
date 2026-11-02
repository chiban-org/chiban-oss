import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { SeedDemoDeps } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'

export const DEMO_SEED_INSTANT = new Date('2027-06-01T16:00:00Z')

export async function demoSeedDeps(): Promise<SeedDemoDeps> {
  const base = await mkdtemp(path.join(tmpdir(), 'demo-seed-'))
  return {
    records: { mail: createMemoryTransport() },
    inspections: { now: DEMO_SEED_INSTANT },
    operations: {
      exportDir: path.join(base, 'exports'),
      legacySourceDir: path.join(base, 'legacy'),
      mail: createMemoryTransport(),
    },
  }
}
