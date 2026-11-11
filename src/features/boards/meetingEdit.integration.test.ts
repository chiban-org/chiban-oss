import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { agendas, auditLog, boardMeetings } from '@/db/schema'
import { updateMeetingDetails } from '@/features/boards/meetingEdit'
import { cancelMeeting } from '@/features/boards/meetings'
import { scheduleHearing } from '@/features/hearings/hearings'
import {
  type BoardWorld,
  boardIdSql,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'

const signal = new AbortController().signal
const BEFORE_THE_MEETING = new Date('2027-04-01T16:00:00Z')
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
})
afterEach(async () => {
  await handle.drop()
})

async function zbaMeeting() {
  const [meeting] = await handle.db
    .select()
    .from(boardMeetings)
    .where(
      and(
        eq(boardMeetings.meetingDate, '2027-04-15'),
        eq(boardMeetings.boardId, boardIdSql('zba')),
      ),
    )
  if (meeting === undefined) throw new Error('no meeting')
  return meeting
}

function update(
  meetingId: string,
  startsAtMinute: number,
  location = 'Town Hall',
  now = BEFORE_THE_MEETING,
) {
  return updateMeetingDetails(
    handle.db,
    world.staff,
    { meetingId, startsAtMinute, location, now },
    signal,
  )
}

describe('changing a meeting time and place', () => {
  it('stores the new start time and location and records who changed them', async () => {
    const meeting = await zbaMeeting()
    const result = await update(meeting.id, 1110, 'Library, lower level')
    expect(result).toEqual({
      ok: true,
      value: { timeChanged: true, agendaReopened: false, hearings: 0 },
    })
    const after = await zbaMeeting()
    expect({ minute: after.startsAtMinute, location: after.location }).toEqual({
      minute: 1110,
      location: 'Library, lower level',
    })
    const [audit] = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, meeting.id), eq(auditLog.action, 'board.meeting.update')))
    expect(audit?.before).toEqual({
      startsAtMinute: meeting.startsAtMinute,
      location: meeting.location,
    })
    expect(audit?.after).toEqual({ startsAtMinute: 1110, location: 'Library, lower level' })
  })

  it('sends a published agenda back to draft when the time changes, so it is shown again with the new time', async () => {
    const meeting = await zbaMeeting()
    await handle.db
      .insert(agendas)
      .values({ meetingId: meeting.id, status: 'published', revision: 1 })
    const result = await update(meeting.id, 1080)
    expect(result.ok ? result.value.agendaReopened : null).toBe(true)
    const [agenda] = await handle.db.select().from(agendas).where(eq(agendas.meetingId, meeting.id))
    expect(agenda?.status).toBe('draft')
  })

  it('leaves a published agenda alone when only the location changes', async () => {
    const meeting = await zbaMeeting()
    await handle.db
      .insert(agendas)
      .values({ meetingId: meeting.id, status: 'published', revision: 1 })
    const result = await update(meeting.id, meeting.startsAtMinute, 'Library')
    expect(result).toEqual({
      ok: true,
      value: { timeChanged: false, agendaReopened: false, hearings: 0 },
    })
  })

  it('counts the hearings whose notices already name the old time', async () => {
    const meeting = await zbaMeeting()
    const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
    await recordNoRegionalImpact(handle.db, world, id)
    await issueListWithRecipients(handle.db, world, id, [recipient(1)])
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId: id, meetingId: meeting.id, kind: 'public_hearing' },
      signal,
    )
    if (!scheduled.ok) throw new Error(JSON.stringify(scheduled.error))
    const result = await update(meeting.id, 1080)
    expect(result.ok ? result.value.hearings : null).toBe(1)
  })

  it('refuses a meeting that has already taken place', async () => {
    const meeting = await zbaMeeting()
    expect(await update(meeting.id, 1080, 'Town Hall', new Date('2027-04-16T16:00:00Z'))).toEqual({
      ok: false,
      error: 'meeting_past',
    })
  })

  it('refuses a cancelled meeting', async () => {
    const meeting = await zbaMeeting()
    await cancelMeeting(
      handle.db,
      world.staff,
      { meetingId: meeting.id, reason: 'No quorum' },
      signal,
      BEFORE_THE_MEETING,
    )
    expect(await update(meeting.id, 1080)).toEqual({ ok: false, error: 'already_cancelled' })
  })

  it('refuses a reviewer and an unknown meeting', async () => {
    const meeting = await zbaMeeting()
    expect(
      await updateMeetingDetails(
        handle.db,
        world.reviewer,
        { meetingId: meeting.id, startsAtMinute: 1080, location: '', now: BEFORE_THE_MEETING },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(await update('00000000-0000-4000-8000-000000000000', 1080)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
