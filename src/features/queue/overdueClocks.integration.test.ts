import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startClocksFor } from '@/features/clocks/startClocks'
import { countWorkQueue, listWorkQueue } from '@/features/queue/workQueue'
import { clocksDailyJob } from '@/jobs/clocksDaily'
import { runJob } from '@/jobs/defineJob'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const TODAY = d('2027-04-02')
const NOW = new Date('2027-04-02T16:00:00Z')
let handle: TestDb
let world: PermitWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function lateDecision(): Promise<string> {
  const app = await makeApplication(handle.db, world, {
    state: 'under_review',
    facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
  })
  await handle.db.transaction((tx) =>
    startClocksFor(tx, app.applicationId, 'application_completed', d('2027-03-01'), signal),
  )
  expect((await runJob(handle.db, clocksDailyJob, { today: TODAY }, signal)).ok).toBe(true)
  return app.applicationId
}

describe('a clock the daily job has marked overdue', () => {
  it('stays the next deadline in the queue and is counted as past a deadline', async () => {
    const id = await lateDecision()
    const queue = await listWorkQueue(
      handle.db,
      world.staff,
      { filters: { due: ['overdue'] }, limit: 25 },
      signal,
      NOW,
    )
    expect(queue.rows.map((r) => r.applicationId)).toEqual([id])
    expect(queue.rows[0]).toMatchObject({
      nextDue: '2027-03-31',
      nextDueLabel: 'Building permit decision deadline',
      dueStatus: 'overdue',
    })
    expect(
      await countWorkQueue(handle.db, world.staff, [{ due: ['overdue'] }], TODAY, signal),
    ).toEqual([1])
  })
})

describe('the upcoming deadlines list', () => {
  it('leaves out applications whose next deadline has already passed', async () => {
    await lateDecision()
    const onTime = await makeApplication(handle.db, world, {
      state: 'under_review',
      facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
    })
    await handle.db.transaction((tx) =>
      startClocksFor(tx, onTime.applicationId, 'application_completed', d('2027-03-25'), signal),
    )
    const queue = await listWorkQueue(
      handle.db,
      world.staff,
      { filters: {}, limit: 25, upcomingOnly: true },
      signal,
      NOW,
    )
    expect(queue.rows.map((r) => r.applicationId)).toEqual([onTime.applicationId])
    expect(queue.rows[0]?.dueStatus).not.toBe('overdue')
  })
})
