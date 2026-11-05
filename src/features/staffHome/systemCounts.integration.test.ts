import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { exportsTable } from '@/db/schema'
import { exportsFailedSinceLastGood } from '@/features/staffHome/systemCounts'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb

type Status = (typeof exportsTable.$inferInsert)['status']

async function exportAt(status: Status, requestedAt: string): Promise<void> {
  await handle.db
    .insert(exportsTable)
    .values({ kind: 'business', status, requestedAt: new Date(requestedAt) })
}

beforeAll(async () => {
  handle = await makeTestDb()
})
beforeEach(async () => {
  await handle.db.delete(exportsTable)
})
afterAll(async () => {
  await handle.drop()
})

describe('exports that failed since the last good one', () => {
  it('counts only failures after the newest export that worked', async () => {
    await exportAt('failed', '2026-10-01T12:00:00Z')
    await exportAt('ready', '2026-10-02T12:00:00Z')
    await exportAt('failed', '2026-10-03T12:00:00Z')
    expect(await exportsFailedSinceLastGood(handle.db, signal)).toBe(1)
  })

  it('still counts a good export whose download has since expired', async () => {
    await exportAt('failed', '2026-10-01T12:00:00Z')
    await exportAt('expired', '2026-10-02T12:00:00Z')
    expect(await exportsFailedSinceLastGood(handle.db, signal)).toBe(0)
  })
})
