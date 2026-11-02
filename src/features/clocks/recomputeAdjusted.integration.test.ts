import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clockAdjustments, clocks } from '@/db/schema'
import { cancelMeeting, scheduleMeeting } from '@/features/boards/meetings'
import { adjustClock } from '@/features/clocks/adjustClock'
import { startClocksFor } from '@/features/clocks/startClocks'
import { makeApplication } from '@/test/applicationFixtures'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function adjustedCompleteness(): Promise<string> {
  const app = await makeApplication(handle.db, world, {}, undefined, world.pbTypeKey)
  await handle.db.transaction((tx) =>
    startClocksFor(tx, app.applicationId, 'application_received', d('2027-03-24'), signal),
  )
  const [clock] = await handle.db
    .select()
    .from(clocks)
    .where(eq(clocks.applicationId, app.applicationId))
    .then((rows) => rows.filter((c) => c.ruleKey === 'nh.pb.completeness'))
  const adjusted = await adjustClock(
    handle.db,
    world.admin,
    {
      clockId: clock?.id ?? '',
      kind: 'statutory_exception',
      newDue: d('2027-05-12'),
      reason: 'Application received during a declared emergency',
      legalAuthority: { citation: 'RSA 4:45', explanation: 'Emergency order tolled the period' },
    },
    signal,
  )
  expect(adjusted.ok).toBe(true)
  return app.applicationId
}

async function runningCompleteness(applicationId: string) {
  const rows = await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
  return rows.filter((c) => c.ruleKey === 'nh.pb.completeness' && c.status === 'running')
}

describe('recomputing a meeting-bound clock that carries an adjustment', () => {
  it('an unrelated meeting leaves the statutory exception governing', async () => {
    const id = await adjustedCompleteness()
    await scheduleMeeting(
      handle.db,
      world.staff,
      { board: 'planning_board', meetingDate: d('2027-09-08'), kind: 'regular' },
      signal,
    )
    const running = await runningCompleteness(id)
    expect(running.map((c) => c.currentDue)).toEqual(['2027-05-12'])
  })

  it('a calendar change that moves the computed date keeps the exception on the new clock', async () => {
    const id = await adjustedCompleteness()
    const [meeting] = await handle.db.query.boardMeetings.findMany({
      where: (m, { eq: equals }) => equals(m.meetingDate, '2027-04-14'),
    })
    await cancelMeeting(
      handle.db,
      world.staff,
      { meetingId: meeting?.id ?? '', reason: 'Quorum not available' },
      signal,
    )
    const running = await runningCompleteness(id)
    expect(running.map((c) => [c.computedDue, c.currentDue])).toEqual([
      ['2027-04-23', '2027-05-12'],
    ])
    const carried = await handle.db
      .select()
      .from(clockAdjustments)
      .where(
        inArray(
          clockAdjustments.clockId,
          running.map((c) => c.id),
        ),
      )
    expect(carried).toMatchObject([
      {
        kind: 'statutory_exception',
        newDue: '2027-05-12',
        legalAuthority: { citation: 'RSA 4:45' },
      },
    ])
  })
})
