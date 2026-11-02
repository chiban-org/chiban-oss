import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recordDecision } from '@/features/decisions/recordDecision'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { loadHearingView } from '@/features/hearings/views'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  recordNoRegionalImpact,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { FIXTURE_VOTES, heldZbaHearing } from '@/test/hearingFixtures'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: ['2027-03-18', '2027-04-15', '2027-05-20'],
  })
})
afterEach(async () => {
  await handle.drop()
})

async function noticedHearing(): Promise<string> {
  const id = await submitBoardApplication(handle.db, world, world.zbaTypeKey, '2027-03-02')
  await recordNoRegionalImpact(handle.db, world, id)
  await issueListWithRecipients(handle.db, world, id, [recipient(1)])
  const [meeting] = await handle.db.query.boardMeetings.findMany({
    where: (m, { eq }) => eq(m.meetingDate, '2027-04-15'),
  })
  const made = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId: id, meetingId: meeting?.id ?? '', kind: 'public_hearing' },
    signal,
  )
  if (!made.ok) throw new Error('schedule')
  const hearing = await handle.db.query.hearings.findFirst({
    where: (h, { eq }) => eq(h.id, made.value.hearingId),
  })
  const now = new Date('2027-04-15T16:00:00Z')
  await proveEverything(handle.db, world, id, hearing?.noticeSetId ?? '', d('2027-03-30'), now)
  await markProperlyNoticed(handle.db, world.staff, made.value.hearingId, signal, now)
  return made.value.hearingId
}

describe('dates before the meeting', () => {
  it('a hearing cannot be marked held before its meeting', async () => {
    const hearingId = await noticedHearing()
    expect(
      await markHearingHeld(
        handle.db,
        world.staff,
        { hearingId, heldOn: d('2027-04-14') },
        signal,
        BOARD_FIXTURE_NOW,
      ),
    ).toEqual({ ok: false, error: 'before_meeting' })
  })

  it('a decision cannot be voted before the hearing was held', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const result = await recordDecision(
      handle.db,
      world.staff,
      {
        applicationId: held.applicationId,
        hearingId: held.hearingId,
        votedOn: d('2027-04-14'),
        outcome: 'approved',
        motion: 'Move to approve.',
        votes: FIXTURE_VOTES,
        findings: 'The proposal meets each criterion.',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(result).toEqual({ ok: false, error: 'before_meeting' })
  })
})

describe('hearing page defaults', () => {
  it('the held date defaults to the meeting, notice is dated in words, and only later meetings are offered', async () => {
    const hearingId = await noticedHearing()
    const view = await loadHearingView(handle.db, world.staff, hearingId, signal)
    expect(view).toMatchObject({ defaultHeldOn: '2027-04-15', noticedOn: 'April 15, 2027' })
    expect(view?.otherMeetings.map((m) => m.text)).toEqual(['May 20, 2027'])
  })

  it('the vote date defaults to the day the hearing was held', async () => {
    const held = await heldZbaHearing(handle.db, world)
    const view = await loadHearingView(handle.db, world.staff, held.hearingId, signal)
    expect(view).toMatchObject({ defaultVotedOn: '2027-04-15' })
  })
})
