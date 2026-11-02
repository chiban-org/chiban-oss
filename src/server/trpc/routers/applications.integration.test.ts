import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApplication } from '@/features/applications/createApplication'
import { createProject } from '@/features/projects/projects'
import { makeTestCaller } from '@/server/testCaller'
import { publishBuildingType } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  await publishBuildingType(handle.db, await staffActor(handle.db, 'admin'))
})
afterAll(async () => {
  await handle.drop()
})

describe('applications.list', () => {
  it('returns only the caller own applications and rejects anonymous callers', async () => {
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '007001000000' }])
    const mine = await staffActor(handle.db, 'applicant')
    const other = await staffActor(handle.db, 'applicant')
    for (const actor of [mine, other]) {
      const p = await createProject(handle.db, actor, { parcelId, title: 'Shed' }, signal)
      if (!p.ok) throw new Error('project')
      await createApplication(
        handle.db,
        actor,
        { projectId: p.value.projectId, applicationTypeKey: 'BP' },
        signal,
      )
    }
    const page = await makeTestCaller(handle.db, mine).applications.list({ limit: 25 })
    expect(page.rows).toHaveLength(1)
    const anonymous = makeTestCaller(handle.db, null).applications.list({ limit: 25 })
    await expect(anonymous).rejects.toBeInstanceOf(TRPCError)
  })
})
