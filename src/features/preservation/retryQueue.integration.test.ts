import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { documentVersions, preservationRecords } from '@/db/schema'
import { listPreservationIncomplete, retryPreservation } from '@/features/preservation/preserve'
import { listPreservationRetrying } from '@/features/preservation/retryQueue'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'

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

describe('preservation retries', () => {
  it('a retried record leaves the incomplete list and shows as waiting to be tried again', async () => {
    const { store } = await makeTestStore()
    const app = await makeApplication(handle.db, world)
    const up = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'application', id: app.applicationId },
      pdfBytes('scanned letter'),
      { title: 'Scanned letter' },
    )
    const [version] = await handle.db
      .select({ id: documentVersions.id })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, up.documentId))
    const [record] = await handle.db
      .update(preservationRecords)
      .set({ status: 'incomplete', reason: 'conversion_failed', attempts: 2 })
      .where(eq(preservationRecords.originalVersionId, version?.id ?? ''))
      .returning({ id: preservationRecords.id })
    expect(await listPreservationRetrying(handle.db, world.staff, signal)).toEqual({
      ok: true,
      value: [],
    })
    const retried = await retryPreservation(
      handle.db,
      world.staff,
      { recordId: record?.id ?? '' },
      signal,
    )
    expect(retried.ok).toBe(true)
    const incomplete = await listPreservationIncomplete(
      handle.db,
      world.staff,
      { limit: 25 },
      signal,
    )
    expect(incomplete.ok && incomplete.value.rows).toEqual([])
    const retrying = await listPreservationRetrying(handle.db, world.staff, signal)
    expect(retrying.ok && retrying.value.map((r) => [r.documentId, r.title, r.attempts])).toEqual([
      [up.documentId, 'Scanned letter', 2],
    ])
  })

  it('a reviewer cannot list the retries', async () => {
    expect(await listPreservationRetrying(handle.db, world.reviewer, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})
