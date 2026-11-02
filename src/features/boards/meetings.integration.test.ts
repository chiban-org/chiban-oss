import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clocks } from '@/db/schema'
import { BOARD_SETTINGS_DEFAULT } from '@/features/boards/boardSettings'
import { cancelMeeting, nextRegularMeeting, scheduleMeeting } from '@/features/boards/meetings'
import { startClocksFor } from '@/features/clocks/startClocks'
import { publishConfig } from '@/features/config/publish'
import { getVersion, saveDraft } from '@/features/config/store'
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

async function completenessFor(received: string) {
  const app = await makeApplication(handle.db, world, {}, undefined, world.pbTypeKey)
  await handle.db.transaction((tx) =>
    startClocksFor(tx, app.applicationId, 'application_received', d(received), signal),
  )
  const rows = await handle.db
    .select()
    .from(clocks)
    .where(eq(clocks.applicationId, app.applicationId))
  const clock = rows.find((c) => c.ruleKey === 'nh.pb.completeness' && c.status === 'running')
  if (clock === undefined) throw new Error('no completeness clock')
  return { app, clock }
}

describe('meeting-bound completeness clock', () => {
  it('completeness for delivery 2027-03-24 is due at the 2027-04-14 meeting', async () => {
    const { clock } = await completenessFor('2027-03-24')
    expect(clock.currentDue).toBe('2027-04-14')
    expect(clock.countingMethod).toContain('2027-04-14')
    expect(clock.countingMethod).toContain('2027-04-23')
  })

  it('completeness for delivery 2027-04-29 is due 2027-05-12', async () => {
    const { clock } = await completenessFor('2027-04-29')
    expect(clock.currentDue).toBe('2027-05-12')
  })

  it('completeness is 30 days, 2027-06-26, when the next noticeable meeting is 2027-07-14', async () => {
    const { clock } = await completenessFor('2027-05-27')
    expect(clock.currentDue).toBe('2027-06-26')
    expect(clock.rolledFrom).toBeNull()
    expect(clock.countingMethod).toContain('2027-07-14')
  })

  it('no meeting on the calendar gives the day limit with basis day_limit', async () => {
    const { clock } = await completenessFor('2027-09-01')
    expect(clock.currentDue).toBe('2027-10-01')
    expect(clock.countingMethod).toContain('no regular meeting')
  })

  it('a zba application binds no meeting-bound clock', async () => {
    const app = await makeApplication(handle.db, world, {}, undefined, world.zbaTypeKey)
    await handle.db.transaction((tx) =>
      startClocksFor(tx, app.applicationId, 'application_received', d('2027-03-02'), signal),
    )
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(rows.map((c) => c.ruleKey).sort()).toEqual(['nh.zba.decision', 'nh.zba.hearing'])
  })

  it('cancelling 2027-04-14 supersedes the running clock with reason meeting_calendar_changed and moves due to 2027-04-23', async () => {
    const { app, clock } = await completenessFor('2027-03-24')
    const [meeting] = await handle.db.query.boardMeetings.findMany({
      where: (m, { eq: equals }) => equals(m.meetingDate, '2027-04-14'),
    })
    const cancelled = await cancelMeeting(
      handle.db,
      world.staff,
      { meetingId: meeting?.id ?? '', reason: 'Quorum not available' },
      signal,
    )
    expect(cancelled.ok).toBe(true)
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    const old = rows.find((c) => c.id === clock.id)
    const fresh = rows.find((c) => c.ruleKey === 'nh.pb.completeness' && c.status === 'running')
    expect(old?.status).toBe('superseded')
    expect(old?.supersededReason).toBe('meeting_calendar_changed')
    expect(old?.supersededBy).toBe(fresh?.id)
    expect(fresh?.currentDue).toBe('2027-04-23')
  })

  it('scheduling a closer meeting moves the due date earlier', async () => {
    const { app } = await completenessFor('2027-05-27')
    const made = await scheduleMeeting(
      handle.db,
      world.staff,
      { board: 'planning_board', meetingDate: d('2027-06-16'), kind: 'regular' },
      signal,
    )
    expect(made.ok).toBe(true)
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    const fresh = rows.find((c) => c.ruleKey === 'nh.pb.completeness' && c.status === 'running')
    expect(fresh?.currentDue).toBe('2027-06-16')
  })

  it('a met clock is not recomputed', async () => {
    const { app, clock } = await completenessFor('2027-03-24')
    await handle.db
      .update(clocks)
      .set({ status: 'met', metOn: '2027-04-14' })
      .where(eq(clocks.id, clock.id))
    const [meeting] = await handle.db.query.boardMeetings.findMany({
      where: (m, { eq: equals }) => equals(m.meetingDate, '2027-04-14'),
    })
    await cancelMeeting(
      handle.db,
      world.staff,
      { meetingId: meeting?.id ?? '', reason: 'Snow' },
      signal,
    )
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, app.applicationId))
    expect(rows.filter((c) => c.ruleKey === 'nh.pb.completeness')).toHaveLength(1)
  })
})

describe('meetings', () => {
  it('nextRegularMeeting skips cancelled and special meetings', async () => {
    await scheduleMeeting(
      handle.db,
      world.staff,
      { board: 'planning_board', meetingDate: d('2027-04-05'), kind: 'special' },
      signal,
    )
    expect(await nextRegularMeeting(handle.db, 'planning_board', d('2027-04-03'), signal)).toBe(
      '2027-04-14',
    )
    expect(await nextRegularMeeting(handle.db, 'zba', d('2027-04-03'), signal)).toBeNull()
  })

  it('the same meeting cannot be scheduled twice', async () => {
    const again = await scheduleMeeting(
      handle.db,
      world.staff,
      { board: 'planning_board', meetingDate: d('2027-04-14'), kind: 'regular' },
      signal,
    )
    expect(again).toEqual({ ok: false, error: 'already_scheduled' })
  })

  it('reviewer scheduling a meeting is forbidden', async () => {
    const made = await scheduleMeeting(
      handle.db,
      world.reviewer,
      { board: 'planning_board', meetingDate: d('2027-08-11'), kind: 'regular' },
      signal,
    )
    expect(made).toEqual({ ok: false, error: 'forbidden' })
  })

  it('reviewer cancelling a meeting is forbidden', async () => {
    const [meeting] = await handle.db.query.boardMeetings.findMany()
    const result = await cancelMeeting(
      handle.db,
      world.reviewer,
      { meetingId: meeting?.id ?? '', reason: 'No' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })

  it('cancelling needs a reason', async () => {
    const [meeting] = await handle.db.query.boardMeetings.findMany()
    const result = await cancelMeeting(
      handle.db,
      world.staff,
      { meetingId: meeting?.id ?? '', reason: '  ' },
      signal,
    )
    expect(result).toEqual({ ok: false, error: 'reason_required' })
  })
})

describe('board settings publish', () => {
  async function publish(body: unknown) {
    const saved = await saveDraft(
      handle.db,
      world.admin,
      { kind: 'board_settings', key: 'default', body },
      signal,
    )
    if (!saved.ok) return saved
    return await publishConfig(handle.db, world.admin, saved.value.versionId, signal)
  }

  it('projection enabled without a layer confirmation is rejected at publish', async () => {
    const result = await publish({
      ...BOARD_SETTINGS_DEFAULT,
      abutters: { ...BOARD_SETTINGS_DEFAULT.abutters, projectionEnabled: true },
    })
    expect(result.ok).toBe(false)
  })

  it('projection enabled with a confirmation publishes', async () => {
    const result = await publish({
      ...BOARD_SETTINGS_DEFAULT,
      abutters: {
        ...BOARD_SETTINGS_DEFAULT.abutters,
        projectionEnabled: true,
        layersConfirmedBy: 'Land Use Technician',
        layersConfirmedOn: '2027-02-01',
      },
    })
    expect(result.ok).toBe(true)
  })

  it('a filing lead of 14 needs an adoption record', async () => {
    const boards = BOARD_SETTINGS_DEFAULT.boards.map((b) =>
      b.board === 'planning_board' ? { ...b, filingLeadDays: 14 } : b,
    )
    expect((await publish({ ...BOARD_SETTINGS_DEFAULT, boards })).ok).toBe(false)
    const adopted = boards.map((b) =>
      b.board === 'planning_board'
        ? {
            ...b,
            filingLeadAdoption: { adoptingAuthority: 'Planning Board', adoptedOn: '2027-01-12' },
          }
        : b,
    )
    expect((await publish({ ...BOARD_SETTINGS_DEFAULT, boards: adopted })).ok).toBe(true)
  })

  it('a filing lead of 22 is refused even with an adoption record', async () => {
    const boards = BOARD_SETTINGS_DEFAULT.boards.map((b) =>
      b.board === 'planning_board'
        ? {
            ...b,
            filingLeadDays: 22,
            filingLeadAdoption: { adoptingAuthority: 'Planning Board', adoptedOn: '2027-01-12' },
          }
        : b,
    )
    expect((await publish({ ...BOARD_SETTINGS_DEFAULT, boards })).ok).toBe(false)
  })
})
