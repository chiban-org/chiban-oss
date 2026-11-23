import { ME_PACK } from '@packs/me'
import { BUILDING_STARTER } from '@packs/me/starters/building'
import { afterEach, describe, expect, it } from 'vitest'
import { loadApplicationContext } from '@/features/applications/context'
import { adoptStarter } from '@/features/config/adoptStarter'
import { evaluateGates } from '@/features/gates/evaluateGates'
import { setActivePackForTest } from '@/features/packs/registry'
import { assignReviewer } from '@/features/reviews/assignments'
import { makeApplication, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb

afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

const NO_REVIEW_REQUIRED = {
  workflow: {
    allowsDirectIssue: false,
    substeps: [],
    closesOn: 'certificate_of_occupancy' as const,
    reviewRequired: false,
  },
}

async function reviewsGate(applicationId: string) {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('no app')
  const results = await handle.db.transaction((tx) =>
    evaluateGates(tx, app, 'decided', '2027-03-10' as CivilDate, signal),
  )
  return results.find((g) => g.key === 'reviews.signed_off')
}

describe('review required flag', () => {
  it('a type that does not require a review can be decided with nobody assigned', async () => {
    handle = await makeTestDb()
    const world = await setupPermitWorld(handle.db, { buildingType: NO_REVIEW_REQUIRED })
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    expect((await reviewsGate(app.applicationId))?.effective).toBe('pass')
  })

  it('a type that does not require a review still blocks on an assigned, unsigned reviewer', async () => {
    handle = await makeTestDb()
    const world = await setupPermitWorld(handle.db, { buildingType: NO_REVIEW_REQUIRED })
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    await assignReviewer(
      handle.db,
      world.staff,
      { applicationId: app.applicationId, reviewerUserId: world.reviewer.userId },
      signal,
    )
    expect((await reviewsGate(app.applicationId))?.effective).toBe('blocked')
  })

  it('a type without the flag still blocks with nobody assigned', async () => {
    handle = await makeTestDb()
    const world = await setupPermitWorld(handle.db)
    const app = await makeApplication(handle.db, world, { state: 'under_review' })
    expect(await reviewsGate(app.applicationId)).toMatchObject({
      effective: 'blocked',
      outcome: { status: 'blocked', reason: 'No reviewer is assigned.' },
    })
  })

  it('a real Maine building permit starter can be decided with nobody assigned', async () => {
    handle = await makeTestDb()
    const world = await setupPermitWorld(handle.db)
    setActivePackForTest(ME_PACK)
    expect(BUILDING_STARTER.applicationType.workflow.reviewRequired).toBe(false)
    const adopted = await adoptStarter(handle.db, world.admin, BUILDING_STARTER.id, signal)
    expect(adopted.ok ? 'ok' : adopted.error).toBe('ok')
    const app = await makeApplication(
      handle.db,
      world,
      { state: 'under_review' },
      undefined,
      BUILDING_STARTER.applicationType.key,
    )
    expect((await reviewsGate(app.applicationId))?.effective).toBe('pass')
  })
})
