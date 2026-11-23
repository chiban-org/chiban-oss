import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { seedDemo } from '@/features/demo/seedDemo'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { makeTestDb, type TestDb } from '@/test/db'
import { useDemoStoryClock } from '@/test/demoSeedDeps'
import { expectedStaffDecision, seededStaffDecisions } from '@/test/seededStaffDecisions'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  await seedDemo(handle.db, signal, { records: { mail: createMemoryTransport() } })
}, 240_000)
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})

describe('staff decisions in the New Hampshire demo', () => {
  it('gives every decided or issued staff permit one register entry and each decision its letter', async () => {
    const rows = await seededStaffDecisions(handle.db)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows).toEqual(rows.map(expectedStaffDecision))
  })
})
