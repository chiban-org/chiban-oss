import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { retentionAssignments } from '@/db/schema'
import { transitionApplication } from '@/features/applications/transition'
import { retentionFor } from '@/features/records/disposition'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { insertInspection } from '@/test/inspectionFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld
let store: ObjectStore

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, { starters: ['nh.starter.building'] })
  store = (await makeTestStore()).store
})
afterAll(async () => {
  await handle.drop()
})

const appRef = (id: string) => ({ kind: 'application' as const, id })

async function currentSeries(documentId: string) {
  const rows = await handle.db
    .select()
    .from(retentionAssignments)
    .where(
      and(
        eq(retentionAssignments.recordKind, 'document'),
        eq(retentionAssignments.recordId, documentId),
      ),
    )
  return { current: rows.find((r) => r.supersededAt === null), all: rows }
}

describe('record series on withdrawal', () => {
  it('withdrawal switches them to nh.rs.building_permits_withdrawn_denied and supersedes the old assignment', async () => {
    const app = await makeApplication(handle.db, world, { state: 'submitted' })
    const up = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef(app.applicationId),
      pdfBytes('withdraw me'),
    )
    const moved = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.applicant,
        {
          applicationId: app.applicationId,
          to: 'withdrawn',
          expectedRowVersion: 1,
          onDate: '2027-05-03' as CivilDate,
        },
        signal,
      ),
    )
    expect(moved.ok).toBe(true)
    const { current, all } = await currentSeries(up.documentId)
    expect(current?.seriesKey).toBe('nh.rs.building_permits_withdrawn_denied')
    expect(current?.reason).toBe('outcome')
    expect(all.filter((r) => r.supersededAt !== null)).toHaveLength(1)
    const status = await retentionFor(handle.db, { kind: 'document', id: up.documentId }, signal)
    expect(status?.status).toEqual({ state: 'eligible_on', date: '2028-05-03' })
  })

  it('withdrawal also moves inspection photos to the outcome series', async () => {
    const app = await makeApplication(handle.db, world, { state: 'submitted' }, undefined, 'BP')
    const inspectionId = await insertInspection(handle.db, app.applicationId, 'final', {
      status: 'scheduled',
      inspectorUserId: world.staff.userId,
    })
    const up = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'inspection', id: inspectionId },
      pdfBytes('photo series'),
    )
    expect((await currentSeries(up.documentId)).current?.seriesKey).toBe('nh.rs.building_permits')
    const moved = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.applicant,
        {
          applicationId: app.applicationId,
          to: 'withdrawn',
          expectedRowVersion: 1,
          onDate: '2027-05-03' as CivilDate,
        },
        signal,
      ),
    )
    expect(moved.ok).toBe(true)
    const { current } = await currentSeries(up.documentId)
    expect(current?.seriesKey).toBe('nh.rs.building_permits_withdrawn_denied')
    expect(current?.reason).toBe('outcome')
  })
})
