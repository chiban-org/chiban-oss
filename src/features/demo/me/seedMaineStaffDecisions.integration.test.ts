import { ME_PACK } from '@packs/me'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { applyMigrations } from '@/db/migrate'
import { seedDemo } from '@/features/demo/seedDemo'
import { setActivePackForTest } from '@/features/packs/registry'
import { syncPackParcelIdFormats } from '@/features/parcels/syncPackFormats'
import { makeEmptyDb, type TestDb } from '@/test/db'
import { demoSeedDeps, useDemoStoryClock } from '@/test/demoSeedDeps'
import { expectedStaffDecision, seededStaffDecisions } from '@/test/seededStaffDecisions'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  useDemoStoryClock()
  setActivePackForTest(ME_PACK)
  handle = await makeEmptyDb()
  const migrated = await applyMigrations(handle.db, signal)
  if (!migrated.ok) throw new Error(migrated.error)
  await syncPackParcelIdFormats(handle.db, signal)
  await seedDemo(handle.db, signal, await demoSeedDeps())
}, 240_000)
afterAll(async () => {
  vi.useRealTimers()
  setActivePackForTest(null)
  await handle.drop()
})

describe('staff decisions in the Maine demo', () => {
  it('gives every decided or issued staff permit one register entry and each decision its letter', async () => {
    const rows = await seededStaffDecisions(handle.db)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows).toEqual(rows.map(expectedStaffDecision))
  })
})
