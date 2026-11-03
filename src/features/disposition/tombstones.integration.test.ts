import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { approveDisposition } from '@/features/disposition/approve'
import { executeDisposition } from '@/features/disposition/execute'
import { proposeDisposition } from '@/features/disposition/propose'
import { listTombstones } from '@/features/disposition/tombstones'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { DISPOSITION_NOW, eligibleCase } from '@/test/dispositionFixtures'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let staff: Actor
let custodian: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  custodian = await staffActor(handle.db, 'records_custodian')
})
afterEach(async () => {
  await handle.drop()
})

async function disposeAll(): Promise<string> {
  const proposed = await proposeDisposition(
    handle.db,
    staff,
    { asOf: '2027-03-01' as CivilDate },
    signal,
    DISPOSITION_NOW,
  )
  if (!proposed.ok) throw new Error(proposed.error)
  const approved = await approveDisposition(
    handle.db,
    custodian,
    { batchId: proposed.value.batchId },
    signal,
  )
  if (!approved.ok) throw new Error(approved.error)
  const ran = await executeDisposition(handle.db, { batchId: proposed.value.batchId }, signal)
  if (!ran.ok) throw new Error(String(ran.error))
  return proposed.value.batchId
}

describe('the list of disposed records', () => {
  it('lists each tombstone with its series, batch and the people behind it, a page at a time', async () => {
    await eligibleCase(handle.db, store, staff, 3)
    const batchId = await disposeAll()
    const first = await listTombstones(handle.db, custodian, { limit: 2 }, signal)
    if (!first.ok) throw new Error(first.error)
    expect(first.value.rows).toHaveLength(2)
    expect(first.value.nextOffset).toBe(2)
    expect(first.value.total).toBe(3)
    const second = await listTombstones(handle.db, custodian, { limit: 2, offset: 2 }, signal)
    if (!second.ok) throw new Error(second.error)
    expect(second.value.rows).toHaveLength(1)
    expect(second.value.nextOffset).toBeNull()
    const rows = [...first.value.rows, ...second.value.rows]
    expect(rows.map((r) => r.title).sort()).toEqual([
      'complaint photo 0',
      'complaint photo 1',
      'complaint photo 2',
    ])
    expect(rows[0]).toMatchObject({
      batchId,
      recordKind: 'document',
      seriesLabel: expect.stringContaining('Complaints') as unknown,
      proposedBy: staff.userId,
      approvedBy: custodian.userId,
    })
  })

  it('needs a disposition capability', async () => {
    const reviewer = await staffActor(handle.db, 'reviewer')
    expect(await listTombstones(handle.db, reviewer, { limit: 25 }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})
