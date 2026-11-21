import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applications, clocks } from '@/db/schema'
import { startClocksFor } from '@/features/clocks/startClocks'
import { recordDecision } from '@/features/decisions/recordDecision'
import { markHearingHeld, markProperlyNoticed, scheduleHearing } from '@/features/hearings/hearings'
import { setActivePackForTest } from '@/features/packs/registry'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  boardIdSql,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { FIXTURE_VOTES, heldZbaHearing } from '@/test/hearingFixtures'
import { issueListWithRecipients, proveEverything, recipient } from '@/test/noticeFixtures'
import { XX_HEARING_CLOCKS } from '@/test/packs/xx/variants'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
const MEETING_DATE = '2027-04-15'
const NO_HEARING = 'xx.pb.decision_no_hearing'
const AFTER_HEARING = 'xx.pb.decision_after_hearing'
const DECISION_CLOCKS = [NO_HEARING, AFTER_HEARING]
let handle: TestDb
let world: BoardWorld

afterEach(async () => {
  await handle.drop()
})

async function clockRows(applicationId: string) {
  return await handle.db.select().from(clocks).where(eq(clocks.applicationId, applicationId))
}

async function meetingId(): Promise<string> {
  const rows = await handle.db.query.boardMeetings.findMany({
    where: (m, { and, eq: same }) =>
      and(same(m.meetingDate, MEETING_DATE), same(m.boardId, boardIdSql('zba'))),
  })
  return rows[0]?.id ?? ''
}

async function acceptedApplication(): Promise<string> {
  const applicationId = await submitBoardApplication(
    handle.db,
    world,
    world.zbaTypeKey,
    '2027-03-02',
  )
  await handle.db
    .update(applications)
    .set({ state: 'under_review' })
    .where(eq(applications.id, applicationId))
  await handle.db.transaction((tx) =>
    startClocksFor(tx, applicationId, 'application_accepted', d('2027-03-02'), signal),
  )
  return applicationId
}

async function holdHearing(
  applicationId: string,
  heldOn: string,
  decideFirst = false,
): Promise<string> {
  await issueListWithRecipients(handle.db, world, applicationId, [recipient(1), recipient(2)])
  const scheduled = await scheduleHearing(
    handle.db,
    world.staff,
    { applicationId, meetingId: await meetingId(), kind: 'public_hearing' },
    signal,
  )
  if (!scheduled.ok) throw new Error('not scheduled')
  const { hearingId } = scheduled.value
  const [hearing] = await handle.db.query.hearings.findMany({
    where: (h, { eq: same }) => same(h.id, hearingId),
  })
  const now = new Date(`${heldOn}T16:00:00Z`)
  await proveEverything(
    handle.db,
    world,
    applicationId,
    hearing?.noticeSetId ?? '',
    d('2027-03-30'),
    now,
  )
  await markProperlyNoticed(handle.db, world.staff, hearingId, signal, now)
  if (decideFirst) expect((await decide(applicationId, null)).ok).toBe(true)
  const held = await markHearingHeld(
    handle.db,
    world.staff,
    { hearingId, heldOn: d(heldOn) },
    signal,
    now,
  )
  if (!held.ok) throw new Error('not held')
  return hearingId
}

async function decide(applicationId: string, hearingId: string | null) {
  return await recordDecision(
    handle.db,
    world.staff,
    {
      applicationId,
      hearingId,
      meetingId: hearingId === null ? await meetingId() : undefined,
      votedOn: d(MEETING_DATE),
      outcome: 'approved',
      motion: 'Move to approve as presented.',
      votes: FIXTURE_VOTES,
      findings: 'The proposal meets each criterion.',
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
}

describe('a clock cancelled by the hearing held event', () => {
  beforeAll(() => {
    setActivePackForTest(XX_HEARING_CLOCKS)
  })
  afterAll(() => {
    setActivePackForTest(null)
  })
  beforeEach(async () => {
    handle = await makeTestDb()
    world = await setupBoardWorld(handle.db, {
      zbaMeetings: [MEETING_DATE],
      pack: XX_HEARING_CLOCKS,
      classificationKey: 'xx.board_variance',
    })
  })

  it('starts the no-hearing clock at acceptance and leaves it running without a hearing', async () => {
    const applicationId = await acceptedApplication()
    const rows = await clockRows(applicationId)
    const first = rows.find((c) => c.ruleKey === NO_HEARING)
    expect(first).toMatchObject({ status: 'running', currentDue: '2027-05-01' })
    expect(rows.find((c) => c.ruleKey === AFTER_HEARING)).toBeUndefined()
  })

  it('holding the hearing supersedes the first clock and starts the second due 30 days on', async () => {
    const applicationId = await acceptedApplication()
    await holdHearing(applicationId, MEETING_DATE)
    const rows = await clockRows(applicationId)
    expect(rows.find((c) => c.ruleKey === NO_HEARING)).toMatchObject({
      status: 'superseded',
      supersededReason: 'cancelled_by_event',
    })
    expect(rows.find((c) => c.ruleKey === AFTER_HEARING)).toMatchObject({
      status: 'running',
      startEvent: 'hearing_held',
      startDate: MEETING_DATE,
      currentDue: '2027-05-15',
    })
  })

  it('deciding after the hearing marks the second clock met and leaves none running', async () => {
    const applicationId = await acceptedApplication()
    const hearingId = await holdHearing(applicationId, MEETING_DATE)
    expect((await decide(applicationId, hearingId)).ok).toBe(true)
    const rows = await clockRows(applicationId)
    expect(rows.find((c) => c.ruleKey === AFTER_HEARING)).toMatchObject({
      status: 'met',
      metOn: MEETING_DATE,
    })
    expect(
      rows.filter((c) => DECISION_CLOCKS.includes(c.ruleKey) && c.status === 'running'),
    ).toEqual([])
  })

  it('deciding without a hearing marks the first clock met and leaves none running', async () => {
    const applicationId = await acceptedApplication()
    expect((await decide(applicationId, null)).ok).toBe(true)
    const rows = await clockRows(applicationId)
    expect(rows.find((c) => c.ruleKey === NO_HEARING)).toMatchObject({
      status: 'met',
      metOn: MEETING_DATE,
    })
    expect(
      rows.filter((c) => DECISION_CLOCKS.includes(c.ruleKey) && c.status === 'running'),
    ).toEqual([])
  })

  it('holding a still scheduled hearing after a decision without one starts no clock', async () => {
    const applicationId = await acceptedApplication()
    await holdHearing(applicationId, MEETING_DATE, true)
    const rows = await clockRows(applicationId)
    expect(rows.find((c) => c.ruleKey === AFTER_HEARING)).toBeUndefined()
    expect(
      rows.filter((c) => DECISION_CLOCKS.includes(c.ruleKey) && c.status === 'running'),
    ).toEqual([])
  })
})

describe('holding a hearing under the NH pack', () => {
  beforeEach(async () => {
    handle = await makeTestDb()
    world = await setupBoardWorld(handle.db, { zbaMeetings: [MEETING_DATE] })
  })

  it('starts, cancels and supersedes nothing', async () => {
    const hearing = await heldZbaHearing(handle.db, world)
    const rows = await clockRows(hearing.applicationId)
    expect(rows.some((c) => c.startEvent === 'hearing_held')).toBe(false)
    expect(rows.some((c) => c.status === 'superseded')).toBe(false)
  })
})
