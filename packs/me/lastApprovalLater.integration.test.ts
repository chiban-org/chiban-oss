import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addAppealNode } from '@/features/appeals/graph'
import { markLastMunicipalApproval } from '@/features/appeals/projectFinality'
import { setActivePackForTest } from '@/features/packs/registry'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { BOA_MEETINGS } from '@/test/maineBoardOfAppealsFixtures'
import {
  acceptAtMeeting,
  clocksOf,
  decideSubdivision,
  HEARING_MEETING,
  publishSubdivisionType,
  receivedSitePlan,
} from '@/test/maineSubdivisionFixtures'
import type { CivilDate } from '@/types/civilDate'
import { err } from '@/types/result'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const COURT_FINAL = 'me.appeal.board_court_final'
const MARKED = '2027-05-10'
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: BOA_MEETINGS })
  setActivePackForTest(ME_PACK)
  await publishSubdivisionType(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function approvedSitePlan() {
  const applicationId = await receivedSitePlan(handle.db, world)
  await acceptAtMeeting(handle.db, world, applicationId)
  const decided = await decideSubdivision(handle.db, world, applicationId, null)
  if (!decided.ok) throw new Error(`decision: ${JSON.stringify(decided.error)}`)
  return { applicationId, decisionId: decided.value.decisionId }
}

async function mark(decisionId: string, on: string) {
  return await markLastMunicipalApproval(
    handle.db,
    world.staff,
    { decisionId, approvedOn: on as CivilDate },
    signal,
    BOARD_FIXTURE_NOW,
  )
}

async function petitionOn(applicationId: string, on: string) {
  const nodes = await handle.db.query.appealNodes.findMany({
    where: (n, { eq: same }) => same(n.applicationId, applicationId),
  })
  const parent = nodes.find((n) => n.kind === 'pb_decision')
  if (parent === undefined) throw new Error('no decision node')
  return await addAppealNode(
    handle.db,
    world.staff,
    {
      parentId: parent.id,
      kind: 'court_petition',
      occurredOn: on as CivilDate,
      appellantName: 'Alder Pond Neighbors',
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
}

describe('a Maine site plan approval marked the last municipal approval later', () => {
  it('starts the court appeal window from the marked date and accepts a petition', async () => {
    const { applicationId, decisionId } = await approvedSitePlan()
    expect(await clocksOf(handle.db, applicationId, COURT_FINAL)).toEqual([])
    expect((await mark(decisionId, MARKED)).ok).toBe(true)
    expect(await clocksOf(handle.db, applicationId, COURT_FINAL)).toMatchObject([
      { status: 'running', startDate: MARKED, currentDue: '2027-06-09' },
    ])
    const petition = await petitionOn(applicationId, '2027-05-20')
    expect(petition.ok).toBe(true)
    const nodes = await handle.db.query.appealNodes.findMany({
      where: (n, { eq: same }) => same(n.kind, 'court_petition'),
    })
    expect(nodes.map((n) => n.untimely)).toEqual([false])
  })

  it('refuses a date before the vote and a second marking', async () => {
    const { decisionId } = await approvedSitePlan()
    expect(await mark(decisionId, '2027-04-13')).toEqual(err('before_vote'))
    expect(await mark(decisionId, HEARING_MEETING)).toMatchObject({ ok: true })
    expect(await mark(decisionId, MARKED)).toEqual(err('already_final'))
  })

  it('refuses a date in the future', async () => {
    const { decisionId } = await approvedSitePlan()
    expect(await mark(decisionId, '2028-02-01')).toEqual(err('future_date'))
  })
})
