import type { Db } from '@/db/client'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'

const SEED_NOW = new Date('2027-06-01T16:00:00Z')

export async function seedExportTown(db: Db, signal: AbortSignal): Promise<void> {
  await seedDemo(db, signal, {
    records: { mail: createMemoryTransport() },
    inspections: { now: SEED_NOW },
  })
}
