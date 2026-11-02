import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { issueList } from '@/features/abutters/issue'
import { generateList } from '@/features/abutters/lists'
import { loadApplicationContext } from '@/features/applications/context'
import { recordCompletenessVote, setAcceptanceMeeting } from '@/features/boards/acceptance'
import { evaluateGates, type GateResult } from '@/features/gates/evaluateGates'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { type ListWorld, prepareListWorld } from '@/test/listFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let lw: ListWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function issueDrawnOn(drawn: string) {
  const now = new Date(`${drawn}T16:00:00Z`)
  const made = await generateList(
    handle.db,
    world.staff,
    { applicationId: lw.applicationId },
    signal,
    now,
  )
  if (!made.ok) throw new Error('generate failed')
  const issued = await issueList(handle.db, world.staff, { listId: made.value.listId }, signal, now)
  if (!issued.ok) throw new Error(`issue failed ${JSON.stringify(issued.error)}`)
}

async function gates(applicationId: string): Promise<GateResult[]> {
  const app = await loadApplicationContext(handle.db, applicationId, signal)
  return await handle.db.transaction((tx) =>
    evaluateGates(
      tx,
      app as NonNullable<typeof app>,
      'under_review',
      '2027-04-14' as CivilDate,
      signal,
    ),
  )
}

describe('abutter list freshness at filing', () => {
  beforeEach(async () => {
    lw = await prepareListWorld(handle.db, world, { receivedOn: '2027-03-24' })
  })

  it('list drawn 6 days before filing blocks acceptance', async () => {
    await issueDrawnOn('2027-03-18')
    const fresh = (await gates(lw.applicationId)).find((g) => g.key === 'nh.pb.abutter_list_fresh')
    expect(fresh?.effective).toBe('blocked')
    expect(fresh?.outcome).toEqual({
      status: 'blocked',
      reason:
        'Abutter list drawn March 18, 2027, more than 5 days before filing on March 24, 2027 (RSA 676:4 I(b)).',
    })
    const meetings = await handle.db.query.boardMeetings.findMany()
    const meetingId = meetings.find((m) => m.meetingDate === '2027-04-14')?.id ?? ''
    await setAcceptanceMeeting(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId, meetingId },
      signal,
    )
    const vote = await recordCompletenessVote(
      handle.db,
      world.staff,
      {
        applicationId: lw.applicationId,
        meetingId,
        votedOn: '2027-04-14' as CivilDate,
        outcome: 'accepted',
      },
      signal,
    )
    expect(vote.ok).toBe(false)
    expect(JSON.stringify(vote)).toContain('nh.pb.abutter_list_fresh')
  })

  it('list drawn 5 days before filing passes', async () => {
    await issueDrawnOn('2027-03-19')
    const results = await gates(lw.applicationId)
    expect(results.find((g) => g.key === 'nh.pb.abutter_list_fresh')?.effective).toBe('pass')
    expect(results.find((g) => g.key === 'abutters.list_issued')?.effective).toBe('pass')
    const meetings = await handle.db.query.boardMeetings.findMany()
    const meetingId = meetings.find((m) => m.meetingDate === '2027-04-14')?.id ?? ''
    await setAcceptanceMeeting(
      handle.db,
      world.staff,
      { applicationId: lw.applicationId, meetingId },
      signal,
    )
    const vote = await recordCompletenessVote(
      handle.db,
      world.staff,
      {
        applicationId: lw.applicationId,
        meetingId,
        votedOn: '2027-04-14' as CivilDate,
        outcome: 'accepted',
      },
      signal,
    )
    expect(vote.ok).toBe(true)
  })

  it('a list drawn after filing passes', async () => {
    await issueDrawnOn('2027-03-26')
    expect(
      (await gates(lw.applicationId)).find((g) => g.key === 'nh.pb.abutter_list_fresh')?.effective,
    ).toBe('pass')
  })

  it('no issued list blocks with both gates', async () => {
    const results = await gates(lw.applicationId)
    expect(results.find((g) => g.key === 'nh.pb.abutter_list_fresh')?.outcome).toEqual({
      status: 'blocked',
      reason: 'No issued abutter list.',
    })
    expect(results.find((g) => g.key === 'abutters.list_issued')?.effective).toBe('blocked')
  })
})

describe('zba lists', () => {
  it('zba hearing acceptance without an issued list is blocked', async () => {
    lw = await prepareListWorld(handle.db, world, { typeKey: world.zbaTypeKey, parcel: 'B' })
    const results = await gates(lw.applicationId)
    expect(results.find((g) => g.key === 'abutters.list_issued')?.effective).toBe('blocked')
    expect(results.find((g) => g.key === 'nh.pb.abutter_list_fresh')).toBeUndefined()
  })

  it('a zba list can be issued and then passes', async () => {
    lw = await prepareListWorld(handle.db, world, { typeKey: world.zbaTypeKey, parcel: 'B' })
    await issueDrawnOn('2027-03-24')
    expect(
      (await gates(lw.applicationId)).find((g) => g.key === 'abutters.list_issued')?.effective,
    ).toBe('pass')
  })
})
