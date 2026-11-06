import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dispositionItems, documents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { approveDisposition } from '@/features/disposition/approve'
import { executeDisposition } from '@/features/disposition/execute'
import { proposeDisposition } from '@/features/disposition/propose'
import { setDocumentSeries } from '@/features/records/assignments'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { DISPOSITION_NOW, eligibleCase } from '@/test/dispositionFixtures'
import { blockedOrSettled, holdOpen } from '@/test/lockWait'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const AS_OF = '2027-03-01' as CivilDate
const PERMANENT = 'nh.rs.unscheduled_permanent'
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

async function approvedBatch(): Promise<string> {
  const proposed = await proposeDisposition(
    handle.db,
    staff,
    { asOf: AS_OF },
    signal,
    DISPOSITION_NOW,
  )
  if (!proposed.ok) throw new Error(`propose ${proposed.error}`)
  const approved = await approveDisposition(
    handle.db,
    custodian,
    { batchId: proposed.value.batchId },
    signal,
  )
  if (!approved.ok) throw new Error(`approve ${approved.error}`)
  return proposed.value.batchId
}

describe('disposition races', () => {
  it('a series change to permanent holds disposal off, and disposal then keeps the record', async () => {
    const made = await eligibleCase(handle.db, store, staff, 1)
    const documentId = made.documentIds[0] ?? ''
    const batchId = await approvedBatch()
    const held = await holdOpen(handle.db, async (tx) => {
      const set = await setDocumentSeries(tx, staff, { documentId, seriesKey: PERMANENT }, signal)
      if (!set.ok) throw new Error(`series ${set.error}`)
    })
    const running = executeDisposition(handle.db, { batchId }, signal)
    const waited = await blockedOrSettled(handle.db, running)
    await held.commit()
    expect(waited).toBe('blocked')
    const report = await running
    expect(report.ok && report.value.disposed).toBe(0)
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, documentId))
    expect(doc?.disposedAt).toBeNull()
  })

  it('two overlapping executions of one batch dispose each record once and both finish', async () => {
    await eligibleCase(handle.db, store, staff, 2)
    const batchId = await approvedBatch()
    const held = await holdOpen(handle.db, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('records.disposition'))`)
    })
    const first = executeDisposition(handle.db, { batchId }, signal)
    const waited = await blockedOrSettled(handle.db, first)
    const second = executeDisposition(handle.db, { batchId }, signal)
    await held.commit()
    expect(waited).toBe('blocked')
    const settled = await Promise.allSettled([first, second])
    expect(settled.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
    const items = await handle.db
      .select()
      .from(dispositionItems)
      .where(eq(dispositionItems.batchId, batchId))
    expect(items.map((i) => i.outcome)).toEqual(['disposed', 'disposed'])
  })
})
