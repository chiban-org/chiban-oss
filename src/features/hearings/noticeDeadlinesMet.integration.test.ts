import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { markProperlyNoticed } from '@/features/hearings/hearings'
import { lateNotice, loadNoticeDeadlines } from '@/features/hearings/noticeDeadlines'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { heldZbaHearing, provenZbaHearing, scheduledZbaHearing } from '@/test/hearingFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const AFTER_HEARING = '2027-04-20' as CivilDate
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

describe('notice deadlines that were met', () => {
  it('returns one met deadline for a held hearing with every item proved', async () => {
    const hearing = await heldZbaHearing(handle.db, world)
    const deadlines = await loadNoticeDeadlines(
      handle.db,
      hearing.applicationId,
      AFTER_HEARING,
      signal,
    )
    expect(deadlines).toEqual([
      {
        hearingId: hearing.hearingId,
        meetingOn: '2027-04-15',
        dueOn: '2027-04-10',
        missing: 0,
        met: true,
        daysRemaining: -10,
      },
    ])
    expect(lateNotice(deadlines)).toBeNull()
  })

  it('returns a met deadline for a scheduled hearing marked properly noticed', async () => {
    const hearing = await provenZbaHearing(handle.db, world)
    const noticed = await markProperlyNoticed(
      handle.db,
      world.staff,
      hearing.hearingId,
      signal,
      new Date('2027-04-12T16:00:00Z'),
    )
    expect(noticed.ok).toBe(true)
    const deadlines = await loadNoticeDeadlines(
      handle.db,
      hearing.applicationId,
      AFTER_HEARING,
      signal,
    )
    expect(deadlines).toMatchObject([{ hearingId: hearing.hearingId, missing: 0, met: true }])
  })

  it('keeps an unproved scheduled hearing as an unmet deadline', async () => {
    const hearing = await scheduledZbaHearing(handle.db, world)
    const deadlines = await loadNoticeDeadlines(
      handle.db,
      hearing.applicationId,
      AFTER_HEARING,
      signal,
    )
    expect(deadlines).toMatchObject([{ hearingId: hearing.hearingId, met: false }])
    expect(deadlines[0]?.missing).toBeGreaterThan(0)
    expect(lateNotice(deadlines)).not.toBeNull()
  })
})
