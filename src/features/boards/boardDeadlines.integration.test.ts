import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { applications } from '@/db/schema'
import { loadBoardsView } from '@/features/boards/boardsView'
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
import { makeTestStore } from '@/test/minio'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterAll(async () => {
  await handle.drop()
})

async function boardLine(applicationId: string, now: Date) {
  const view = await loadBoardsView(handle.db, world.staff, signal, now)
  return view?.sections.flatMap((s) => s.applications).find((l) => l.id === applicationId)
}

async function queueOverdue(now: Date): Promise<string[]> {
  const queue = await listWorkQueue(
    handle.db,
    world.staff,
    { filters: { due: ['overdue'] }, limit: 50 },
    signal,
    now,
  )
  return queue.rows.map((r) => r.applicationId)
}

describe('board list deadlines', () => {
  it('names a missed hearing notice as the overdue deadline, as the queue does', async () => {
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
    const now = new Date('2027-04-12T16:00:00Z')
    expect(await boardLine(id, now)).toMatchObject({
      deadlineOn: '2027-04-10',
      deadlineOverdue: true,
      deadlineText: 'Notice: April 10, 2027 (overdue)',
    })
    expect(await queueOverdue(now)).toContain(id)
  })

  it('keeps a denied application whose filing deadline has passed', async () => {
    const { store } = await makeTestStore()
    const decided = await decidedZba(handle.db, world, store, { documents: false })
    await handle.db
      .update(applications)
      .set({ state: 'denied' })
      .where(eq(applications.id, decided.applicationId))
    const now = new Date('2027-04-26T16:00:00Z')
    expect(await boardLine(decided.applicationId, now)).toMatchObject({
      state: 'denied',
      deadlineOn: '2027-04-22',
      deadlineOverdue: true,
      deadlineText: 'Minutes and written decision filing deadline: April 22, 2027 (overdue)',
    })
    expect(await queueOverdue(now)).toContain(decided.applicationId)
  })
})
