import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { recordDecision } from '@/features/decisions/recordDecision'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { setActivePackForTest } from '@/features/packs/registry'
import { packRoles } from '@/features/packs/roles'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdSql,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import { XX_PACK } from '@/test/packs/xx'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const HEARING_DATE = '2027-04-15'
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(XX_PACK)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: [HEARING_DATE],
    pack: XX_PACK,
    classificationKey: 'xx.board_variance',
  })
})
afterEach(async () => {
  await handle.drop()
})

describe('a hearing on a pack with no regional impact role', () => {
  it('has no regional impact determination role', () => {
    expect(packRoles().rules.regionalImpactDetermination).toBeNull()
  })

  it('schedules, notices, holds and decides a hearing without a determination', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.zbaTypeKey,
      '2027-03-02',
    )
    await issueListWithRecipients(handle.db, world, applicationId, [recipient(1), recipient(2)])
    const meeting = await handle.db.query.boardMeetings.findMany({
      where: (m, { and, eq }) =>
        and(eq(m.meetingDate, HEARING_DATE), eq(m.boardId, boardIdSql('zba'))),
    })
    const scheduled = await scheduleHearing(
      handle.db,
      world.staff,
      { applicationId, meetingId: meeting[0]?.id ?? '', kind: 'public_hearing' },
      signal,
    )
    expect(scheduled).toEqual({ ok: true, value: { hearingId: expect.any(String) } })
    if (!scheduled.ok) return
    const { hearingId } = scheduled.value
    const [hearing] = await handle.db.query.hearings.findMany({
      where: (h, { eq }) => eq(h.id, hearingId),
    })
    const items = await handle.db.query.noticeItems.findMany({
      where: (i, { eq }) => eq(i.setId, hearing?.noticeSetId ?? ''),
    })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((i) => i.requirementKey === 'xx.zba.notice.mail')).toBe(true)
    const now = new Date(`${HEARING_DATE}T16:00:00Z`)
    await proveEverything(
      handle.db,
      world,
      applicationId,
      hearing?.noticeSetId ?? '',
      d('2027-03-30'),
      now,
    )
    expect((await markProperlyNoticed(handle.db, world.staff, hearingId, signal, now)).ok).toBe(
      true,
    )
    const held = await markHearingHeld(
      handle.db,
      world.staff,
      { hearingId, heldOn: d(HEARING_DATE) },
      signal,
      now,
    )
    expect(held.ok).toBe(true)
    const decided = await recordDecision(
      handle.db,
      world.staff,
      {
        applicationId,
        hearingId,
        votedOn: d(HEARING_DATE),
        outcome: 'approved',
        motion: 'Move to approve as presented.',
        votes: {
          for: 3,
          against: 0,
          abstain: 0,
          members: [
            { name: 'Avery Stone', vote: 'for' },
            { name: 'Robin Vale', vote: 'for' },
            { name: 'Morgan Reed', vote: 'for' },
          ],
        },
        findings: 'The proposal meets each criterion.',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(decided.ok).toBe(true)
  })
})
