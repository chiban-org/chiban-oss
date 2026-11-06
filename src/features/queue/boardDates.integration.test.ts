import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { scheduleHearing } from '@/features/hearings/hearings'
import { listWorkQueue } from '@/features/queue/workQueue'
import {
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba } from '@/test/hearingFixtures'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
const NOW = new Date('2027-04-01T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterAll(async () => {
  await handle.drop()
})

async function rowFor(applicationId: string, now = NOW) {
  const queue = await listWorkQueue(handle.db, world.staff, { filters: {}, limit: 50 }, signal, now)
  return queue.rows.find((r) => r.applicationId === applicationId)
}

describe('board dates on the work queue', () => {
  it('a scheduled hearing with unproved notice shows the notice due date', async () => {
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    await recordNoRegionalImpact(handle.db, world, id)
    await issueListWithRecipients(handle.db, world, id, [recipient(1)])
    const [meeting] = await handle.db.query.boardMeetings.findMany({
      where: (m, { eq }) => eq(m.meetingDate, '2027-04-15'),
    })
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: meeting?.id ?? '', kind: 'public_hearing' },
      signal,
    )
    expect(scheduled.ok).toBe(true)
    expect(await rowFor(id)).toMatchObject({
      noticeDue: '2027-04-10',
      noticeOverdue: false,
      filingDue: null,
    })
  })

  it('a missed notice heads the due cell when it is earlier than every running clock', async () => {
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    await recordNoRegionalImpact(handle.db, world, id)
    await issueListWithRecipients(handle.db, world, id, [recipient(1)])
    const [meeting] = await handle.db.query.boardMeetings.findMany({
      where: (m, { eq }) => eq(m.meetingDate, '2027-04-15'),
    })
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: meeting?.id ?? '', kind: 'public_hearing' },
      signal,
    )
    expect(scheduled.ok).toBe(true)
    expect(await rowFor(id, new Date('2027-04-12T16:00:00Z'))).toMatchObject({
      nextDue: '2027-04-10',
      nextDueLabel: 'Notice',
      daysUntilDue: -2,
      dueStatus: 'overdue',
      clockDue: '2027-04-16',
      clockDueLabel: 'ZBA hearing deadline',
    })
  })

  it('a decision awaiting filing shows the filing due date and no notice date once noticed', async () => {
    const { store } = await makeTestStore()
    const decided = await decidedZba(handle.db, world, store, { documents: false })
    expect(await rowFor(decided.applicationId)).toMatchObject({
      noticeDue: null,
      filingDue: '2027-04-22',
      filingOverdue: false,
    })
    expect(await rowFor(decided.applicationId, new Date('2027-04-26T16:00:00Z'))).toMatchObject({
      filingDue: '2027-04-22',
      filingOverdue: true,
    })
  })

  it('keeps a denied application in the default view while its filing deadline runs', async () => {
    const { store } = await makeTestStore()
    const decided = await decidedZba(handle.db, world, store, { documents: false })
    await handle.db
      .update(applications)
      .set({ state: 'denied' })
      .where(eq(applications.id, decided.applicationId))
    expect(await rowFor(decided.applicationId)).toMatchObject({
      state: 'denied',
      filingDue: '2027-04-22',
    })
  })
})
