import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documents, parcelRecordLinks } from '@/db/schema'
import { setCaseParcel } from '@/features/enforcement/caseParcel'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  issuedOrder,
  setupEnforcementWorld,
  uploadProof,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/minio'
import { makeParcel } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let world: EnforcementWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupEnforcementWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function linkedDocumentIds(parcelId: string): Promise<string[]> {
  const rows = await handle.db
    .select({ recordId: parcelRecordLinks.recordId })
    .from(parcelRecordLinks)
    .where(
      and(eq(parcelRecordLinks.parcelId, parcelId), eq(parcelRecordLinks.recordKind, 'document')),
    )
  return rows.map((r) => r.recordId).sort()
}

describe('linking a case to a parcel', () => {
  it('links the documents the case already has, so approved public ones reach the parcel page', async () => {
    const { store } = await makeTestStore()
    const order = await issuedOrder(handle.db, store, world)
    await uploadProof(handle.db, store, world.staff, order.caseId)
    const caseDocs = await handle.db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(eq(documents.recordKind, 'enforcement_case'), eq(documents.recordId, order.caseId)),
      )
    expect(caseDocs.length).toBeGreaterThanOrEqual(2)
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '031005000000' }])
    const linked = await setCaseParcel(
      handle.db,
      world.staff,
      { caseId: order.caseId, parcelRef: '031005000000' },
      signal,
    )
    expect(linked).toEqual({ ok: true, value: { parcelId } })
    expect(await linkedDocumentIds(parcelId)).toEqual(caseDocs.map((d) => d.id).sort())
  })
})
