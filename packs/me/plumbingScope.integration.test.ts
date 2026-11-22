import { ME_STARTERS } from '@packs/me/starters'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadApplicationContext } from '@/features/applications/context'
import { actorMayMove } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { markComplete } from '@/features/building/completeness'
import { adoptStarter } from '@/features/config/adoptStarter'
import { listCounterTypes } from '@/features/counter/directIssueTypes'
import { overrideAdministrativeGate } from '@/features/gates/overrides'
import { setActivePackForTest } from '@/features/packs/registry'
import { assignReviewer } from '@/features/reviews/assignments'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffWith } from '@/test/staffUsers'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T17:00:00Z')
const RECEIVED = '2027-03-01' as CivilDate
const COMPLETED = '2027-03-02' as CivilDate
let handle: TestDb
let world: PermitWorld
let plumber: Actor

async function submitted(typeKey: string): Promise<string> {
  const made = await makeApplication(
    handle.db,
    world,
    { state: 'submitted', receivedDate: RECEIVED },
    NOW,
    typeKey,
  )
  return made.applicationId
}

async function mayStartReview(actor: Actor, applicationId: string): Promise<boolean> {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  if (app === null) throw new Error('missing application')
  return await actorMayMove(handle.db, actor, app, 'under_review', signal)
}

function assign(actor: Actor, applicationId: string) {
  return assignReviewer(
    handle.db,
    actor,
    { applicationId, reviewerUserId: world.reviewer.userId },
    signal,
  )
}

function override(actor: Actor, applicationId: string) {
  return overrideAdministrativeGate(
    handle.db,
    actor,
    {
      applicationId,
      gateKey: 'conditions.blocking_met',
      reason: 'Design letter from the site evaluator is on file',
    },
    signal,
  )
}

function complete(actor: Actor, applicationId: string) {
  return markComplete(handle.db, actor, { applicationId, completedDate: COMPLETED }, signal, NOW)
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(ME_PACK)
  for (const starter of ME_STARTERS) {
    const adopted = await adoptStarter(handle.db, world.admin, starter.id, signal)
    expect(adopted.ok ? 'ok' : adopted.error, starter.id).toBe('ok')
  }
  plumber = await staffWith(handle.db, ['plumbing_inspector'])
})
beforeEach(() => {
  setActivePackForTest(ME_PACK)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('starting the review on a plumbing permit', () => {
  it('a plumbing inspector starts the review on a subsurface wastewater permit but not on a building permit', async () => {
    expect(await mayStartReview(plumber, await submitted('SSW'))).toBe(true)
    expect(await mayStartReview(plumber, await submitted('BP'))).toBe(false)
  })

  it('land use staff still start the review on a plumbing permit', async () => {
    expect(await mayStartReview(world.staff, await submitted('SSW'))).toBe(true)
  })
})

describe('review controls on a plumbing permit', () => {
  it('a plumbing inspector assigns a reviewer on a subsurface wastewater permit but not on a building permit', async () => {
    expect(await assign(plumber, await submitted('SSW'))).toMatchObject({ ok: true })
    expect(await assign(plumber, await submitted('BP'))).toEqual({ ok: false, error: 'forbidden' })
  })

  it('a plumbing inspector records an override on a subsurface wastewater permit but not on a building permit', async () => {
    expect(await override(plumber, await submitted('SSW'))).toEqual({ ok: true, value: undefined })
    expect(await override(plumber, await submitted('BP'))).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('marking a Maine application complete', () => {
  it('a plumbing inspector marks a subsurface wastewater permit complete but not a building permit', async () => {
    expect(await complete(plumber, await submitted('SSW'))).toEqual({ ok: true, value: undefined })
    expect(await complete(plumber, await submitted('BP'))).toEqual({
      ok: false,
      error: 'forbidden',
    })
  })
})

describe('the counter lists by who may issue', () => {
  it('land use staff take an internal plumbing permit for review and the plumbing inspector issues it today', async () => {
    const forStaff = await listCounterTypes(handle.db, signal, world.staff)
    expect(forStaff.takeForReview.map((t) => t.key)).toContain('IP')
    expect(forStaff.issueToday.map((t) => t.key)).not.toContain('IP')
    const forPlumber = await listCounterTypes(handle.db, signal, plumber)
    expect(forPlumber.issueToday.map((t) => t.key)).toContain('IP')
  })
})

describe('marking a New Hampshire building permit complete', () => {
  let nh: TestDb
  let nhWorld: PermitWorld

  beforeAll(async () => {
    setActivePackForTest(null)
    nh = await makeTestDb()
    nhWorld = await setupPermitWorld(nh.db)
  })
  afterAll(async () => {
    await nh.drop()
  })

  it('an inspector who is not land use staff is refused', async () => {
    setActivePackForTest(null)
    const inspector = await staffWith(nh.db, ['inspector'])
    const made = await makeApplication(
      nh.db,
      nhWorld,
      { state: 'submitted', receivedDate: RECEIVED },
      NOW,
    )
    const refused = await markComplete(
      nh.db,
      inspector,
      { applicationId: made.applicationId, completedDate: COMPLETED },
      signal,
      NOW,
    )
    expect(refused).toEqual({ ok: false, error: 'forbidden' })
    const allowed = await markComplete(
      nh.db,
      nhWorld.staff,
      { applicationId: made.applicationId, completedDate: COMPLETED },
      signal,
      NOW,
    )
    expect(allowed).toEqual({ ok: true, value: undefined })
  })
})
