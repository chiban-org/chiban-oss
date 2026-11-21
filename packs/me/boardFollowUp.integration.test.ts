import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, completenessVotes } from '@/db/schema'
import { recordSelectmenCertification } from '@/features/boards/certification'
import { loadBoardPanel } from '@/features/boards/panelData'
import { setActivePackForTest } from '@/features/packs/registry'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  ACCEPTANCE_MEETING,
  acceptAtMeeting,
  clocksOf,
  publishSubdivisionType,
  RECEIVED,
  receivedSubdivision,
  voteAtMeeting,
} from '@/test/maineSubdivisionFixtures'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const LATER_MEETING = '2027-04-14'
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  setActivePackForTest(ME_PACK)
  await publishSubdivisionType(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function stateOf(id: string) {
  const [row] = await handle.db
    .select({ state: applications.state, closureReason: applications.closureReason })
    .from(applications)
    .where(eq(applications.id, id))
  return row
}

describe('the selectmen certification step under the Maine pack', () => {
  it('is not offered while the subdivision decision clock runs', async () => {
    const id = await receivedSubdivision(handle.db, world, 'not_within')
    await acceptAtMeeting(handle.db, world, id)
    expect(await clocksOf(handle.db, id, 'me.pb.decision_no_hearing')).toMatchObject([
      { status: 'running' },
    ])
    const panel = await loadBoardPanel(handle.db, world.staff, id, signal)
    expect(panel?.certification).toEqual({ offered: false, history: [] })
  })

  it('refuses a certification request after the decision date passes', async () => {
    const id = await receivedSubdivision(handle.db, world, 'not_within')
    await acceptAtMeeting(handle.db, world, id)
    const requested = await recordSelectmenCertification(
      handle.db,
      world.staff,
      { applicationId: id, requestedOn: '2027-06-01' as CivilDate, outcome: 'pending' },
      signal,
    )
    expect(requested).toEqual({ ok: false, error: 'clock_not_overdue' })
  })
})

describe('a Maine subdivision found incomplete', () => {
  it('stays open, records the vote and meets the completeness notice', async () => {
    const id = await receivedSubdivision(handle.db, world, 'not_within')
    await voteAtMeeting(handle.db, world, id, {
      on: ACCEPTANCE_MEETING,
      outcome: 'not_accepted',
      reason: 'The plan lacks the soils report.',
    })
    expect(await stateOf(id)).toEqual({ state: 'submitted', closureReason: null })
    const votes = await handle.db
      .select({ outcome: completenessVotes.outcome, reason: completenessVotes.reason })
      .from(completenessVotes)
      .where(eq(completenessVotes.applicationId, id))
    expect(votes).toEqual([{ outcome: 'not_accepted', reason: 'The plan lacks the soils report.' }])
    expect(await clocksOf(handle.db, id, 'me.pb.completeness')).toMatchObject([
      { status: 'met', startDate: RECEIVED, metOn: ACCEPTANCE_MEETING },
    ])
    expect(await clocksOf(handle.db, id, 'me.pb.decision_no_hearing')).toEqual([])
  })

  it('starts the acceptance clocks at a later accepted vote', async () => {
    const id = await receivedSubdivision(handle.db, world, 'not_within')
    await voteAtMeeting(handle.db, world, id, {
      on: ACCEPTANCE_MEETING,
      outcome: 'not_accepted',
      reason: 'The plan lacks the soils report.',
    })
    await voteAtMeeting(handle.db, world, id, { on: LATER_MEETING, outcome: 'accepted' })
    expect((await stateOf(id))?.state).toBe('under_review')
    expect(await clocksOf(handle.db, id, 'me.pb.decision_no_hearing')).toMatchObject([
      { status: 'running', startDate: LATER_MEETING, currentDue: '2027-06-13' },
    ])
    expect(await clocksOf(handle.db, id, 'me.pb.completeness')).toMatchObject([
      { status: 'met', metOn: ACCEPTANCE_MEETING },
    ])
  })
})
