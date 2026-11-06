import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dispositionItems, documents, legalHolds } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { approveDisposition } from '@/features/disposition/approve'
import { executeDisposition } from '@/features/disposition/execute'
import { proposeDisposition } from '@/features/disposition/propose'
import { placeHold } from '@/features/records/holds'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { DISPOSITION_NOW, eligibleCase } from '@/test/dispositionFixtures'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const AS_OF = '2027-03-01' as CivilDate
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

async function approvedFor(count: number) {
  const made = await eligibleCase(handle.db, store, staff, count)
  const proposed = await proposeDisposition(
    handle.db,
    staff,
    { asOf: AS_OF },
    signal,
    DISPOSITION_NOW,
  )
  if (!proposed.ok) throw new Error('propose')
  await approveDisposition(handle.db, custodian, { batchId: proposed.value.batchId }, signal)
  return { made, batchId: proposed.value.batchId }
}

const holdOn = (documentId: string) =>
  placeHold(
    handle.db,
    custodian,
    { target: { kind: 'document', id: documentId }, reason: 'Litigation hold from counsel' },
    signal,
  )

describe('disposition and holds share one lock', () => {
  it('hold placed after approval skips the record at execution', async () => {
    const { made, batchId } = await approvedFor(2)
    await holdOn(made.documentIds[0] ?? '')
    const ran = await executeDisposition(handle.db, { batchId }, signal)
    expect(ran.ok && ran.value).toMatchObject({ disposed: 1, skippedHold: 1 })
    const items = await handle.db.select().from(dispositionItems)
    expect(items.find((i) => i.recordId === made.documentIds[0])?.outcome).toBe('skipped_hold')
  })

  it('an uncommitted hold blocks execution until it commits, then the record is skipped', async () => {
    const { made, batchId } = await approvedFor(1)
    const target = made.documentIds[0] ?? ''
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let locked: () => void = () => undefined
    const holding = new Promise<void>((resolve) => {
      locked = resolve
    })
    const placing = handle.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('records.disposition'))`)
      await tx.insert(legalHolds).values({
        targetKind: 'document',
        targetId: target,
        reason: 'Litigation hold from counsel',
        placedBy: custodian.userId,
      })
      locked()
      await gate
    })
    await holding
    let finished = false
    const execution = executeDisposition(handle.db, { batchId }, signal).then((r) => {
      finished = true
      return r
    })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(finished).toBe(false)
    release()
    await placing
    const ran = await execution
    expect(ran.ok && ran.value).toMatchObject({ disposed: 0, skippedHold: 1 })
    const [doc] = await handle.db.select().from(documents).where(eq(documents.id, target))
    expect(doc?.disposedAt).toBeNull()
  })

  it('twelve concurrent hold placements during execution never dispose a held record', async () => {
    const { made, batchId } = await approvedFor(12)
    const outcomes = await Promise.all([
      executeDisposition(handle.db, { batchId }, signal),
      ...made.documentIds.map((id) => holdOn(id)),
    ])
    expect(outcomes.every((o) => o.ok)).toBe(true)
    const docs = await handle.db.select().from(documents)
    const holds = await handle.db.select().from(legalHolds)
    const items = await handle.db.select().from(dispositionItems)
    expect(holds).toHaveLength(12)
    for (const id of made.documentIds) {
      const doc = docs.find((d) => d.id === id)
      const hold = holds.find((h) => h.targetId === id)
      const item = items.find((i) => i.recordId === id)
      if (doc?.disposedAt != null) {
        expect(item?.outcome).toBe('disposed')
        expect((hold?.placedAt ?? new Date(0)).getTime()).toBeGreaterThan(doc.disposedAt.getTime())
      } else {
        expect(item?.outcome).toBe('skipped_hold')
      }
    }
  })
})
