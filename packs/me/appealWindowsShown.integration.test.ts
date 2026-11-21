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
  deniedSubdivision,
  filedOn,
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
const d = (s: string) => s as CivilDate
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

async function nodeOf(applicationId: string, kind: string) {
  const rows = await loadGraphNodeRows(handle.db, applicationId)
  const node = rows.filter((n) => n.kind === kind).at(-1)
  if (node === undefined) throw new Error(`no ${kind} node`)
  return node
}

async function step(
  parentId: string,
  kind: 'rehearing_motion' | 'rehearing_outcome' | 'court_petition',
  on: string,
  outcome?: string,
) {
  const added = await addAppealNode(
    handle.db,
    world.staff,
    {
      parentId,
      kind,
      occurredOn: d(on),
      appellantName: 'Fernhollow Lake Association',
      ...(outcome === undefined ? {} : { outcome }),
    },
    signal,
    BOARD_FIXTURE_NOW,
  )
  if (!added.ok) throw new Error(`${kind}: ${added.error}`)
  const nodes = await handle.db.query.appealNodes.findMany({
    where: (n, { eq: same }) => same(n.id, added.value.nodeId),
  })
  return nodes[0]
}

describe('a reconsidered Board of Appeals decision on a project the planning board approved last', () => {
  for (const outcome of ['granted', 'denied'] as const) {
    it(`shows and judges the 15-day window, reconsideration ${outcome}`, async () => {
      const variance = await decidedBoa(handle.db, world)
      const subdivision = await receivedSubdivision(handle.db, world, 'not_within')
      await acceptAtMeeting(handle.db, world, subdivision)
      await approvedLastSubdivision(handle.db, world, subdivision, '2027-04-28')
      const decision = await nodeOf(variance.applicationId, 'zba_decision')
      const motion = await step(decision.id, 'rehearing_motion', '2027-04-20')
      await step(motion?.id ?? '', 'rehearing_outcome', '2027-05-05', outcome)
      const reconsidered = await nodeOf(variance.applicationId, 'rehearing_outcome')
      expect(
        await clocksOf(handle.db, variance.applicationId, 'me.appeal.board_court_final'),
      ).toEqual([])
      expect(
        await clocksOf(
          handle.db,
          variance.applicationId,
          'me.appeal.boa_court_after_planning_board',
        ),
      ).toMatchObject([{ status: 'superseded', startDate: '2027-04-28' }])
      const reconsiderationWindow = ruleByKey(
        loadPack(),
        'me.appeal.boa_court_after_reconsideration',
      )
      expect(await nodeWindow(handle.db, reconsidered, signal)).toMatchObject({
        label: reconsiderationWindow.label,
        dueText: formatCivilDate('2027-05-20'),
      })
      const petition = await step(reconsidered.id, 'court_petition', '2027-05-25')
      expect(petition?.untimely).toBe(true)
    })
  }
})

describe('a significant Planning Board denial before its written decision is filed', () => {
  it('says when the window starts on the graph and in the portal, then shows the date', async () => {
    const id = await receivedSubdivision(handle.db, world, 'not_within')
    await acceptAtMeeting(handle.db, world, id)
    const made = await deniedSubdivision(handle.db, world, id, true)
    const shownBefore = await nodeWindow(handle.db, await nodeOf(id, 'pb_decision'), signal)
    expect(shownBefore?.dueText).toBe('after the written decision is filed')
    const before = await loadPortalBoardRecord(handle.db, world.applicant, id, signal)
    if (!before.ok) throw new Error(before.error)
    expect(before.value.deadlines).toContain(
      'Court appeal of a significant denial, starts after the written decision is filed.',
    )
    await filedOn(handle.db, world, made, '2027-04-20')
    const shownAfter = await nodeWindow(handle.db, await nodeOf(id, 'pb_decision'), signal)
    expect(shownAfter?.dueText).toBe(formatCivilDate('2027-05-20'))
    const after = await loadPortalBoardRecord(handle.db, world.applicant, id, signal)
    if (!after.ok) throw new Error(after.error)
    expect(after.value.deadlines).toContain(
      'Court appeal of a significant denial, due May 20, 2027.',
    )
    expect(after.value.deadlines.filter((l) => l.includes('starts after'))).toEqual([])
  })
})
