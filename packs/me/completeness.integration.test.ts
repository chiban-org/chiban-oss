import { ME_PACK } from '@packs/me'
import { ME_STARTERS } from '@packs/me/starters'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { getStaffApplicationView } from '@/features/applications/staffApplicationView'
import type { CoreState } from '@/features/applications/states'
import { transitionApplication } from '@/features/applications/transition'
import { planWork } from '@/features/applications/workPlan'
import { markComplete, markedCompleteMessage } from '@/features/building/completeness'
import { startClocksFor } from '@/features/clocks/startClocks'
import { adoptStarter } from '@/features/config/adoptStarter'
import { setActivePackForTest } from '@/features/packs/registry'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { signedOffReview } from '@/test/reviewFixtures'
import { clockRows } from '@/test/triggerClockFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-10T15:00:00Z')
const RECEIVED = '2027-03-01'
const COMPLETED = '2027-03-03' as CivilDate
const DECIDED = '2027-03-08' as CivilDate
let handle: TestDb
let world: PermitWorld

async function received(prefix: string): Promise<string> {
  const made = await makeApplication(
    handle.db,
    world,
    { state: 'submitted', receivedDate: RECEIVED },
    NOW,
    prefix,
  )
  return made.applicationId
}

async function receivedWastewater(): Promise<string> {
  const applicationId = await received('SSW')
  await handle.db.transaction((tx) =>
    startClocksFor(tx, applicationId, 'application_received', RECEIVED as CivilDate, signal),
  )
  return applicationId
}

async function completenessTask(applicationId: string) {
  const view = await getStaffApplicationView(handle.db, world.staff, applicationId, NOW, signal)
  if (view === null) throw new Error('missing view')
  const plan = planWork(view, null, {
    reviewers: 0,
    abilities: new Set(['mark_complete']),
    responsible: null,
  })
  return plan.groups.flatMap((g) => g.rows).find((r) => r.key === 'completeness')
}

async function complete(applicationId: string) {
  const done = await markComplete(
    handle.db,
    world.staff,
    { applicationId, completedDate: COMPLETED },
    signal,
    NOW,
  )
  expect(done.ok).toBe(true)
}

async function move(applicationId: string, to: CoreState) {
  const [row] = await handle.db
    .select({ rowVersion: applications.rowVersion })
    .from(applications)
    .where(eq(applications.id, applicationId))
  const moved = await handle.db.transaction((tx) =>
    transitionApplication(
      tx,
      world.staff,
      { applicationId, to, expectedRowVersion: row?.rowVersion ?? 0, onDate: DECIDED },
      signal,
      NOW,
    ),
  )
  expect(moved.ok ? 'ok' : JSON.stringify(moved.error)).toBe('ok')
}

async function clockOf(applicationId: string, ruleKey: string) {
  return (await clockRows(handle.db, applicationId)).find((c) => c.ruleKey === ruleKey)
}

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  setActivePackForTest(ME_PACK)
  for (const starter of ME_STARTERS) {
    const adopted = await adoptStarter(handle.db, world.admin, starter.id, signal)
    expect(adopted.ok ? 'ok' : adopted.error, starter.id).toBe('ok')
  }
})
beforeEach(() => {
  setActivePackForTest(ME_PACK)
})
afterAll(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

describe('the shoreland decision date', () => {
  it('offers staff the completeness step on a shoreland permit', async () => {
    const applicationId = await received('SLZ')
    expect(await completenessTask(applicationId)).toMatchObject({
      action: { kind: 'mark_complete' },
    })
  })

  it('starts when staff mark the application complete and is met when the permit is decided', async () => {
    const applicationId = await received('SLZ')
    expect(await clockOf(applicationId, 'town.slz.decision')).toBeUndefined()
    await complete(applicationId)
    expect(await clockOf(applicationId, 'town.slz.decision')).toMatchObject({
      status: 'running',
      startDate: COMPLETED,
    })
    await move(applicationId, 'under_review')
    await signedOffReview(handle.db, world, applicationId, signal)
    await move(applicationId, 'decided')
    expect(await clockOf(applicationId, 'town.slz.decision')).toMatchObject({
      status: 'met',
      metOn: DECIDED,
    })
  })

  it('is met when the permit is denied', async () => {
    const applicationId = await received('SLZ')
    await complete(applicationId)
    await move(applicationId, 'under_review')
    await move(applicationId, 'denied')
    expect(await clockOf(applicationId, 'town.slz.decision')).toMatchObject({
      status: 'met',
      metOn: DECIDED,
    })
  })

  it('does not offer the completeness step on a permit with no completeness clock', async () => {
    const applicationId = await received('LU')
    expect(await completenessTask(applicationId)).toBeUndefined()
  })
})

describe('the subsurface wastewater completeness date', () => {
  it('runs from receipt and offers staff the completeness step', async () => {
    const applicationId = await receivedWastewater()
    expect(await clockOf(applicationId, 'me.ssw.completeness')).toMatchObject({
      status: 'running',
    })
    const task = await completenessTask(applicationId)
    expect(task).toMatchObject({ action: { kind: 'mark_complete' } })
    expect(task?.detail).not.toContain('decision clock')
  })

  it('is met when staff mark the application complete', async () => {
    const applicationId = await receivedWastewater()
    await complete(applicationId)
    expect(await clockOf(applicationId, 'me.ssw.completeness')).toMatchObject({
      status: 'met',
      metOn: COMPLETED,
    })
    expect(await markedCompleteMessage(handle.db, applicationId, signal)).toBe(
      'Marked complete. The completeness review date is met.',
    )
    expect(await completenessTask(applicationId)).toBeUndefined()
  })
})
