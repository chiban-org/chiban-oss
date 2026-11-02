import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recordBuildingRemoved } from '@/features/records/assignments'
import { checkDisposition, retentionFor } from '@/features/records/disposition'
import { holdsCovering, placeHold } from '@/features/records/holds'
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

async function inspectionPhoto(seriesKey?: string) {
  const app = await makeApplication(handle.db, world, { state: 'submitted' }, undefined, 'BP')
  const inspectionId = await insertInspection(handle.db, app.applicationId, 'final', {
    status: 'scheduled',
  })
  const up = await uploadAs(
    handle.db,
    store,
    world.staff,
    { kind: 'inspection', id: inspectionId },
    pdfBytes(`photo ${inspectionId}`),
    seriesKey === undefined ? undefined : { seriesKey },
  )
  return { app, ref: { kind: 'document' as const, id: up.documentId } }
}

describe('inspection documents inherit application and project ancestry', () => {
  it('an application hold covers an inspection photo', async () => {
    const { app, ref } = await inspectionPhoto()
    const keeper = await staffActor(handle.db, 'records_custodian')
    const held = await placeHold(
      handle.db,
      keeper,
      {
        target: { kind: 'application', id: app.applicationId },
        reason: 'Litigation over the final inspection',
      },
      signal,
    )
    expect(held.ok).toBe(true)
    expect(await holdsCovering(handle.db, ref, signal)).toHaveLength(1)
  })

  it('a project hold covers an inspection photo', async () => {
    const { ref } = await inspectionPhoto()
    const keeper = await staffActor(handle.db, 'records_custodian')
    await placeHold(
      handle.db,
      keeper,
      {
        target: { kind: 'project', id: world.projectId },
        reason: 'Litigation over the whole project',
      },
      signal,
    )
    expect((await holdsCovering(handle.db, ref, signal)).length).toBeGreaterThan(0)
  })

  it('a building removal on the project starts the clock for an inspection photo', async () => {
    const { ref } = await inspectionPhoto('nh.rs.blueprints_architectural')
    const before = await retentionFor(handle.db, ref, signal)
    expect(before?.status.state).toBe('not_yet_triggered')
    await recordBuildingRemoved(
      handle.db,
      world.staff,
      { projectId: world.projectId, occurredOn: '2040-06-01' as CivilDate },
      signal,
    )
    const after = await retentionFor(handle.db, ref, signal)
    expect(after?.status.state).toBe('eligible_on')
    const keeper = await staffActor(handle.db, 'records_custodian')
    await placeHold(
      handle.db,
      keeper,
      { target: { kind: 'project', id: world.projectId }, reason: 'Hold after removal event' },
      signal,
    )
    expect(await checkDisposition(handle.db, ref, '2090-01-01' as CivilDate, signal)).toEqual({
      ok: false,
      error: 'on_hold',
    })
  })
})
