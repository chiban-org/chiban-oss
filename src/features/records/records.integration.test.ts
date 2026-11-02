import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { retentionAssignments } from '@/db/schema'
import { transitionApplication } from '@/features/applications/transition'
import { createUploadIntent } from '@/features/documents/uploads'
import { createProject } from '@/features/projects/projects'
import { recordBuildingRemoved } from '@/features/records/assignments'
import { checkDisposition, retentionFor } from '@/features/records/disposition'
import { placeHold, releaseHold } from '@/features/records/holds'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { insertInspection } from '@/test/inspectionFixtures'
import { makeTestStore } from '@/test/minio'
import { staffActor } from '@/test/parcels'
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

describe('record series', () => {
  it('submitted building permit attachments get nh.rs.building_permits', async () => {
    const app = await makeApplication(handle.db, world)
    const up = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef(app.applicationId),
      pdfBytes('series default'),
    )
    expect((await currentSeries(up.documentId)).current?.seriesKey).toBe('nh.rs.building_permits')
  })

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

  it('expired permit switches to the lapsed series', async () => {
    const app = await makeApplication(handle.db, world, { state: 'issued' })
    const up = await uploadAs(
      handle.db,
      store,
      world.staff,
      appRef(app.applicationId),
      pdfBytes('lapse me'),
    )
    const moved = await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        { kind: 'system', job: 'clocks.daily' },
        {
          applicationId: app.applicationId,
          to: 'expired',
          expectedRowVersion: 1,
          onDate: '2028-03-02' as CivilDate,
        },
        signal,
      ),
    )
    expect(moved.ok).toBe(true)
    expect((await currentSeries(up.documentId)).current?.seriesKey).toBe(
      'nh.rs.building_permits_lapsed',
    )
  })

  it('parcel-file upload without a series is refused', async () => {
    const result = await createUploadIntent(
      handle.db,
      store,
      world.staff,
      {
        target: { kind: 'parcel', id: world.parcelId },
        title: 'Survey',
        filename: 's.pdf',
        contentType: 'application/pdf',
        sizeBytes: 20,
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'series_required' })
    const unknown = await createUploadIntent(
      handle.db,
      store,
      world.staff,
      {
        target: { kind: 'parcel', id: world.parcelId },
        title: 'Survey',
        filename: 's.pdf',
        contentType: 'application/pdf',
        sizeBytes: 20,
        seriesKey: 'nope',
      },
      signal,
    )
    expect(unknown).toEqual({ ok: false, error: 'unknown_series' })
  })

  it('a parcel-file upload with a series gets it as a staff assignment', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'parcel', id: world.parcelId },
      pdfBytes('plat'),
      { seriesKey: 'nh.rs.blueprints_architectural' },
    )
    const { current } = await currentSeries(up.documentId)
    expect(current).toMatchObject({ seriesKey: 'nh.rs.blueprints_architectural', reason: 'staff' })
    const waiting = await retentionFor(handle.db, { kind: 'document', id: up.documentId }, signal)
    expect(waiting?.status).toEqual({ state: 'not_yet_triggered', awaiting: ['building_removed'] })
  })
})

describe('legal holds', () => {
  async function withdrawnDocument() {
    const app = await makeApplication(handle.db, world, { state: 'submitted' })
    const up = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef(app.applicationId),
      pdfBytes(`held ${app.applicationId}`),
    )
    await handle.db.transaction((tx) =>
      transitionApplication(
        tx,
        world.applicant,
        {
          applicationId: app.applicationId,
          to: 'withdrawn',
          expectedRowVersion: 1,
          onDate: '2020-01-01' as CivilDate,
        },
        signal,
      ),
    )
    return { app, up }
  }

  it('hold on the project blocks disposition of an eligible document with on_hold', async () => {
    const { up } = await withdrawnDocument()
    const ref = { kind: 'document' as const, id: up.documentId }
    const today = '2030-01-01' as CivilDate
    expect((await checkDisposition(handle.db, ref, today, signal)).ok).toBe(true)
    const keeper = await staffActor(handle.db, 'records_custodian')
    const held = await placeHold(
      handle.db,
      keeper,
      {
        target: { kind: 'project', id: world.projectId },
        reason: 'Litigation pending on the site',
      },
      signal,
    )
    expect(held.ok).toBe(true)
    expect(await checkDisposition(handle.db, ref, today, signal)).toEqual({
      ok: false,
      error: 'on_hold',
    })
    if (!held.ok) return
    const released = await releaseHold(
      handle.db,
      keeper,
      { holdId: held.value.holdId, reason: 'Case closed in court' },
      signal,
    )
    expect(released.ok).toBe(true)
    expect((await checkDisposition(handle.db, ref, today, signal)).ok).toBe(true)
  })

  it('staff placing a hold is forbidden; records custodian succeeds', async () => {
    const input = {
      target: { kind: 'project' as const, id: world.projectId },
      reason: 'Records request pending',
    }
    expect(await placeHold(handle.db, world.staff, input, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const keeper = await staffActor(handle.db, 'records_custodian')
    expect((await placeHold(handle.db, keeper, input, signal)).ok).toBe(true)
    expect(await placeHold(handle.db, keeper, { ...input, reason: 'short' }, signal)).toEqual({
      ok: false,
      error: 'reason_required',
    })
  })

  it('permanent and untriggered series block disposition by reason', async () => {
    const lone = await staffActor(handle.db, 'applicant')
    const project = await createProject(
      handle.db,
      lone,
      { parcelId: world.parcelId, title: 'Porch' },
      signal,
    )
    if (!project.ok) throw new Error('project')
    const app = await makeApplication(handle.db, {
      ...world,
      projectId: project.value.projectId,
      applicant: lone,
    })
    const up = await uploadAs(
      handle.db,
      store,
      lone,
      appRef(app.applicationId),
      pdfBytes('permanent'),
    )
    const result = await checkDisposition(
      handle.db,
      { kind: 'document', id: up.documentId },
      '2090-01-01' as CivilDate,
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'permanent' })
  })

  it('a building removal event starts the clock on a blueprint', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'parcel', id: world.parcelId },
      pdfBytes('blueprint'),
      { seriesKey: 'nh.rs.blueprints_architectural' },
    )
    const ref = { kind: 'document' as const, id: up.documentId }
    expect((await checkDisposition(handle.db, ref, '2090-01-01' as CivilDate, signal)).ok).toBe(
      false,
    )
    const removed = await recordBuildingRemoved(
      handle.db,
      world.staff,
      { projectId: world.projectId, occurredOn: '2040-06-01' as CivilDate },
      signal,
    )
    expect(removed.ok).toBe(true)
    const forbidden = await recordBuildingRemoved(
      handle.db,
      world.reviewer,
      { projectId: world.projectId, occurredOn: '2040-06-01' as CivilDate },
      signal,
    )
    expect(forbidden).toEqual({ ok: false, error: 'forbidden' })
    expect((await checkDisposition(handle.db, ref, '2090-01-01' as CivilDate, signal)).ok).toBe(
      true,
    )
  })
})
