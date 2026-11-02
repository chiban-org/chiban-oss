import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportsTable, files } from '@/db/schema'
import { getObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedFormats, seedTown } from '@/test/parcels'
import { buildBusinessExport } from './exportsBuild'

const signal = new AbortController().signal
const store = getObjectStore()
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedFormats(handle.db)
  await seedTown(handle.db)
  const sha = createHash('sha256').update(crypto.randomUUID()).digest('hex')
  await handle.db.insert(files).values({
    sha256: sha,
    sizeBytes: 12,
    contentType: 'text/plain',
    storageKey: `blobs/sha256/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`,
  })
}, 120_000)
afterAll(async () => {
  await handle.drop()
})

describe('business export build failure', () => {
  it('an export whose source blob is missing ends failed instead of hanging', async () => {
    const [row] = await handle.db
      .insert(exportsTable)
      .values({ kind: 'business', status: 'queued' })
      .returning({ id: exportsTable.id })
    const exportId = row?.id ?? ''
    const built = await buildBusinessExport(handle.db, store, exportId, signal)
    expect(built.ok).toBe(false)
    const [after] = await handle.db.select().from(exportsTable).where(eq(exportsTable.id, exportId))
    expect(after?.status).toBe('failed')
    expect(after?.error).not.toBeNull()
  }, 30_000)
})
