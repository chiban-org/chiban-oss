import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enforcementCases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { heldByPrivateCase } from '@/features/documents/publicSettingMessage'
import { openCase } from '@/features/enforcement/cases'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let staff: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
})
afterEach(async () => {
  await handle.drop()
})

describe('heldByPrivateCase', () => {
  it('is true for an enforcement case document until the case is public', async () => {
    const opened = await openCase(handle.db, staff, { locationText: '14 Birch Lane' }, signal)
    if (!opened.ok) throw new Error('case')
    const doc = await uploadAs(
      handle.db,
      store,
      staff,
      { kind: 'enforcement_case', id: opened.value.caseId },
      pdfBytes('photo log'),
      { title: 'Photo log', docKind: 'enforcement_photo' },
    )
    expect(await heldByPrivateCase(handle.db, doc.documentId)).toBe(true)
    await handle.db
      .update(enforcementCases)
      .set({ isPublic: true, publicSummary: 'Shed built without a permit.' })
      .where(eq(enforcementCases.id, opened.value.caseId))
    expect(await heldByPrivateCase(handle.db, doc.documentId)).toBe(false)
  })
})
