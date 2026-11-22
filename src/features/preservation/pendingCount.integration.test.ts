import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { documentVersions, preservationRecords } from '@/db/schema'
import { awaitingFirstCopyText, countAwaitingFirstCopy } from '@/features/preservation/pendingCount'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

async function upload(title: string): Promise<string> {
  const { store } = await makeTestStore()
  const app = await makeApplication(handle.db, world)
  const up = await uploadAs(
    handle.db,
    store,
    world.staff,
    { kind: 'application', id: app.applicationId },
    pdfBytes(title),
    { title },
  )
  const [version] = await handle.db
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, up.documentId))
  return version?.id ?? ''
}

describe('documents waiting for their first archival copy', () => {
  it('counts pending rows never tried, and leaves out failed and retried ones', async () => {
    const versions = [
      await upload('Site plan'),
      await upload('Septic design'),
      await upload('Survey'),
      await upload('Deed copy'),
    ]
    await handle.db
      .update(preservationRecords)
      .set({ status: 'pending', attempts: 0 })
      .where(inArray(preservationRecords.originalVersionId, versions.slice(0, 2)))
    await handle.db
      .update(preservationRecords)
      .set({ status: 'incomplete', reason: 'conversion_failed', attempts: 1 })
      .where(eq(preservationRecords.originalVersionId, versions[2] ?? ''))
    await handle.db
      .update(preservationRecords)
      .set({ status: 'pending', attempts: 2 })
      .where(eq(preservationRecords.originalVersionId, versions[3] ?? ''))
    expect(await countAwaitingFirstCopy(handle.db, world.staff, signal)).toEqual({
      ok: true,
      value: 2,
    })
  })

  it('refuses a user who cannot manage documents', async () => {
    expect(await countAwaitingFirstCopy(handle.db, world.reviewer, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })

  it('words the waiting count in the singular at one and says nothing at zero', () => {
    expect(awaitingFirstCopyText(0)).toBeNull()
    expect(awaitingFirstCopyText(1)).toBe('1 document is waiting for its first archival copy.')
    expect(awaitingFirstCopyText(3)).toBe('3 documents are waiting for their first archival copy.')
  })
})
