import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addAppealNode } from '@/features/appeals/graph'
import { loadGraphNodeRows } from '@/features/appeals/graphNodeRows'
import { nodeWindow } from '@/features/appeals/nodeWindow'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { setActivePackForTest } from '@/features/packs/registry'
import { loadPortalBoardRecord } from '@/features/portal/boardRecord'
import { formatCivilDate } from '@/lib/formatDate'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  approvedLastSubdivision,
  BOA_MEETINGS,
  decidedBoa,
  publishBoardOfAppealsTypes,
} from '@/test/maineBoardOfAppealsFixtures'
import {
  acceptAtMeeting,
  clocksOf,
  publishSubdivisionType,
  receivedSubdivision,
} from '@/test/maineSubdivisionFixtures'
import type { CivilDate } from '@/types/civilDate'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const AFTER_PLANNING_BOARD = 'me.appeal.boa_court_after_planning_board'
const BOA_COURT = 'me.appeal.boa_court'
let handle: TestDb
let world: BoardWorld

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: BOA_MEETINGS })
  setActivePackForTest(ME_PACK)
  await publishBoardOfAppealsTypes(handle.db, world)
  await publishSubdivisionType(handle.db, world)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

async function decisionNode(applicationId: string) {
  const rows = await loadGraphNodeRows(handle.db, applicationId)
  const node = rows.find((n) => n.kind === 'zba_decision')
  if (node === undefined) throw new Error('no decision node')
  return node
}

async function petitionUntimely(applicationId: string, on: string) {
  const added = await addAppealNode(
    handle.db,
    world.staff,
    {
      parentId: (await decisionNode(applicationId)).id,
      kind: 'court_petition',
      occurredOn: on as CivilDate,
      appellantName: 'Fernhollow Lake Association',
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!added.ok) throw new Error(`petition: ${added.error}`)
  const nodes = await handle.db.query.appealNodes.findMany({
    where: (n, { eq: same }) => same(n.id, added.value.nodeId),
  })
  return nodes[0]?.untimely
}

async function portalDeadlines(applicationId: string) {
  const record = await loadPortalBoardRecord(handle.db, world.applicant, applicationId, signal)
  if (!record.ok) throw new Error(record.error)
  return record.value.deadlines
}

function label(key: string) {
  return ruleByKey(loadPack(), key).label
}

describe('a Board of Appeals variance that is the last municipal approval', () => {
  it('runs no 30-day window and keeps the 45-day court appeal', async () => {
    const variance = await decidedBoa(handle.db, world, { last: true })
    expect(await clocksOf(handle.db, variance.applicationId, AFTER_PLANNING_BOARD)).toEqual([])
    expect(
      await clocksOf(handle.db, variance.applicationId, 'me.appeal.board_court_final'),
    ).toEqual([])
    const deadlines = await portalDeadlines(variance.applicationId)
    expect(deadlines.filter((l) => l.includes('Court appeal of an approval'))).toEqual([])
    expect(deadlines.filter((l) => l.includes('starts after'))).toEqual([])
    expect(deadlines).toContain(`${label(BOA_COURT)}, due June 1, 2027.`)
    expect(
      await nodeWindow(handle.db, await decisionNode(variance.applicationId), signal),
    ).toMatchObject({ label: label(BOA_COURT), dueText: formatCivilDate('2027-06-01') })
    expect(await petitionUntimely(variance.applicationId, '2027-05-29')).toBe(false)
  })
})

describe('a Board of Appeals variance on a project the planning board approves last', () => {
  it('runs the 30-day window from the planning board approval and judges by it', async () => {
    const variance = await decidedBoa(handle.db, world)
    const subdivision = await receivedSubdivision(handle.db, world, 'not_within')
    await acceptAtMeeting(handle.db, world, subdivision)
    await approvedLastSubdivision(handle.db, world, subdivision, '2027-04-28')
    expect(await clocksOf(handle.db, variance.applicationId, AFTER_PLANNING_BOARD)).toMatchObject([
      { status: 'running', startDate: '2027-04-28', currentDue: '2027-05-28' },
    ])
    expect(
      await nodeWindow(handle.db, await decisionNode(variance.applicationId), signal),
    ).toMatchObject({ label: label(AFTER_PLANNING_BOARD), dueText: formatCivilDate('2027-05-28') })
    expect(await petitionUntimely(variance.applicationId, '2027-05-29')).toBe(true)
  })
})

describe('a standalone approved Board of Appeals variance', () => {
  it('lists no window waiting for a last municipal approval', async () => {
    const variance = await decidedBoa(handle.db, world)
    const deadlines = await portalDeadlines(variance.applicationId)
    expect(deadlines.filter((l) => l.includes('starts after'))).toEqual([])
    expect(deadlines).toContain(`${label(BOA_COURT)}, due June 1, 2027.`)
  })
})
