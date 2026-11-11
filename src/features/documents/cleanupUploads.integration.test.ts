import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { magicLinks, uploadIntents } from '@/db/schema'
import {
  cleanupAbandonedUploads,
  cleanupExpiredMagicLinks,
} from '@/features/documents/cleanupUploads'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
const NOW = new Date('2027-03-01T12:00:00.000Z')
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
let handle: TestDb
let store: ObjectStore
const userId = crypto.randomUUID()

beforeAll(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
})
afterAll(async () => {
  await handle.drop()
})

async function intent(tempKey: string, expiresAt: Date, finalizedAt: Date | null) {
  await handle.db.insert(uploadIntents).values({
    userId,
    targetKind: 'parcel',
    targetId: crypto.randomUUID(),
    title: 'Plan',
    filename: 'plan.pdf',
    contentType: 'application/pdf',
    sizeBytes: 5,
    tempKey,
    expiresAt,
    finalizedAt,
  })
  await store.putBytes(tempKey, Buffer.from('hello'), 'application/pdf', signal)
}

describe('abandoned upload cleanup', () => {
  it('removes the object and row of an intent expired over an hour, and keeps the rest', async () => {
    await intent('uploads/tmp/old', new Date(NOW.getTime() - 61 * MINUTE_MS), null)
    await intent('uploads/tmp/recent', new Date(NOW.getTime() - 30 * MINUTE_MS), null)
    await intent('uploads/tmp/live', new Date(NOW.getTime() + 5 * MINUTE_MS), null)
    await intent('uploads/tmp/done', new Date(NOW.getTime() - 3 * DAY_MS), NOW)
    const removed = await cleanupAbandonedUploads(handle.db, store, NOW, signal)
    expect(removed).toBe(1)
    const keys = (await handle.db.select().from(uploadIntents)).map((r) => r.tempKey).sort()
    expect(keys).toEqual(['uploads/tmp/done', 'uploads/tmp/live', 'uploads/tmp/recent'])
    const objects = await store.list('uploads/tmp/', signal)
    expect(objects).not.toContain('uploads/tmp/old')
    expect(objects).toContain('uploads/tmp/live')
  })

  it('still removes the row when the object is already gone', async () => {
    await handle.db.insert(uploadIntents).values({
      userId,
      targetKind: 'parcel',
      targetId: crypto.randomUUID(),
      title: 'Plan',
      filename: 'plan.pdf',
      contentType: 'application/pdf',
      sizeBytes: 5,
      tempKey: 'uploads/tmp/missing',
      expiresAt: new Date(NOW.getTime() - 2 * DAY_MS),
    })
    await cleanupAbandonedUploads(handle.db, store, NOW, signal)
    const rows = await handle.db
      .select()
      .from(uploadIntents)
      .where(eq(uploadIntents.tempKey, 'uploads/tmp/missing'))
    expect(rows).toEqual([])
  })
})

describe('magic link cleanup', () => {
  it('removes links expired more than a day ago and keeps newer ones', async () => {
    const row = (hash: string, expiresAt: Date) => ({
      email: 'cleanup@alderpond.example',
      tokenHash: hash,
      expiresAt,
    })
    await handle.db
      .insert(magicLinks)
      .values([
        row('old', new Date(NOW.getTime() - DAY_MS - MINUTE_MS)),
        row('recent', new Date(NOW.getTime() - DAY_MS + MINUTE_MS)),
        row('future', new Date(NOW.getTime() + MINUTE_MS)),
      ])
    const removed = await cleanupExpiredMagicLinks(handle.db, NOW)
    expect(removed).toBe(1)
    const hashes = (await handle.db.select().from(magicLinks)).map((r) => r.tokenHash).sort()
    expect(hashes).toEqual(['future', 'recent'])
  })
})
