import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { listWorkQueue } from '@/features/queue/workQueue'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    buildingType: {
      workflow: {
        allowsDirectIssue: false,
        closesOn: 'certificate_of_occupancy',
        substeps: [
          { state: 'issued', key: 'co_pending', label: 'Certificate of occupancy pending' },
        ],
      },
    },
  })
})
afterAll(async () => {
  await handle.drop()
})

describe('work queue substep label', () => {
  it('carries the label the application type declares for the substep', async () => {
    const app = await makeApplication(handle.db, world, {
      state: 'issued',
      substep: 'co_pending',
    } as never)
    const page = await listWorkQueue(
      handle.db,
      world.staff,
      { filters: { states: ['issued'] }, limit: 10 },
      signal,
    )
    const row = page.rows.find((r) => r.applicationId === app.applicationId)
    expect(row?.substepLabel).toBe('Certificate of occupancy pending')
  })
})
