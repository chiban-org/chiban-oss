import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listDocuments } from '@/features/documents/listDocuments'
import { setPublic, uploadRedactedCopy } from '@/features/documents/publish'
import { createUploadIntent } from '@/features/documents/uploads'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/minio'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let appId: string

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  appId = (await makeApplication(handle.db, world)).applicationId
})
afterAll(async () => {
  await handle.drop()
})

const appRef = () => ({ kind: 'application' as const, id: appId })

describe('hasRedactedCopy on document list rows', () => {
  it('is true only for the document that has a public_redacted version', async () => {
    const withCopy = await uploadAs(handle.db, store, world.staff, appRef(), pdfBytes('with'), {
      title: 'With copy',
    })
    const without = await uploadAs(handle.db, store, world.staff, appRef(), pdfBytes('without'), {
      title: 'Without copy',
    })
    await setPublic(
      handle.db,
      world.staff,
      { documentId: withCopy.documentId, isPublic: true },
      signal,
    )
    const intent = await createUploadIntent(
      handle.db,
      store,
      world.staff,
      {
        target: appRef(),
        title: 'With copy',
        filename: 'redacted.pdf',
        contentType: 'application/pdf',
        sizeBytes: pdfBytes('redacted').length,
      },
      signal,
    )
    if (!intent.ok) throw new Error('intent')
    await fetch(intent.value.url, {
      method: 'PUT',
      headers: intent.value.headers,
      body: new Blob([pdfBytes('redacted')]),
    })
    const up = await uploadRedactedCopy(
      handle.db,
      store,
      world.staff,
      { documentId: withCopy.documentId, intentId: intent.value.intentId },
      signal,
    )
    expect(up.ok).toBe(true)
    const rows = (
      await listDocuments(handle.db, world.staff, { record: appRef(), limit: 50 }, signal)
    ).rows
    expect(rows.find((r) => r.documentId === withCopy.documentId)?.hasRedactedCopy).toBe(true)
    expect(rows.find((r) => r.documentId === without.documentId)?.hasRedactedCopy).toBe(false)
  })
})
