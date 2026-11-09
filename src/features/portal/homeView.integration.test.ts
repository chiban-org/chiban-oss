import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadPortalHome } from '@/features/portal/homeView'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db, {
    buildingType: {
      documents: [
        {
          key: 'septic_approval',
          label: 'State septic approval',
          stage: 'before_issue',
          waivable: false,
        },
      ],
    },
  })
})
afterAll(async () => {
  await handle.drop()
})

describe('loadPortalHome', () => {
  it('puts an approved application with a document still owed under Needs you', async () => {
    const decided = await makeApplication(handle.db, world, {
      state: 'decided',
      receivedDate: '2027-01-04',
    })
    const rows = await loadPortalHome(handle.db, world.applicant, signal)
    expect(rows.find((r) => r.id === decided.applicationId)).toMatchObject({
      group: 'needs_you',
      nextStep: 'Add State septic approval.',
    })
  })

  it('leaves deleted drafts out before the page limit, so older live work still shows', async () => {
    const live = await makeApplication(handle.db, world, {
      state: 'submitted',
      receivedDate: '2027-01-05',
    })
    await makeApplication(handle.db, world, { state: 'withdrawn' })
    await makeApplication(handle.db, world, { state: 'withdrawn' })
    const rows = await loadPortalHome(handle.db, world.applicant, signal, { limit: 1 })
    expect(rows.map((r) => r.id)).toEqual([live.applicationId])
  })
})
