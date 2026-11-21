import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { recipientRolesFor } from '@/features/abutters/roles'
import { addAppealNode } from '@/features/appeals/graph'
import { loadGraphNodeRows } from '@/features/appeals/graphNodeRows'
import { nodeWindow } from '@/features/appeals/nodeWindow'
import { boardForKind } from '@/features/boards/townBoards'
import { setActivePackForTest } from '@/features/packs/registry'
import { TOWN_PROFILE_SKELETON } from '@/features/town/profileSchema'
import { formatCivilDate } from '@/lib/formatDate'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  BOA_MEETINGS,
  BOA_RECEIVED,
  BOA_VARIANCE_TYPE,
  deniedSubdivision,
  filedOn,
  publishBoardOfAppealsTypes,
  scheduleBoaHearing,
} from '@/test/maineBoardOfAppealsFixtures'
import {
  acceptAtMeeting,
  clocksOf,
  HEARING_MEETING,
  itemsOf,
  publishSubdivisionType,
  receivedSubdivision,
} from '@/test/maineSubdivisionFixtures'
import { issueListWithRecipients, recipient } from '@/test/noticeFixtures'
import type { CivilDate } from '@/types/civilDate'
import { meRecipientResolver } from './abutters/resolver'
import { ME_PACK } from './index'

const signal = new AbortController().signal
const TOWN_OFFICE = ['2 Common Road', 'Fernhollow, ME 04000']
const FILED = '2027-04-20'
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

async function resolvedParties(applicationId: string) {
  const spec = ME_PACK.manifest.classifications.find((c) => c.key === 'me.boa_variance')?.abutters
  if (spec === null || spec === undefined) throw new Error('no abutter spec')
  const flags = { regionalImpact: false, desWithin: false, sourceWaterArea: null }
  const out = await handle.db.transaction((tx) =>
    meRecipientResolver.resolve(
      tx,
      {
        applicationId,
        candidates: [],
        roles: recipientRolesFor(spec, flags),
        conditionalRoles: [],
        now: BOARD_FIXTURE_NOW,
      },
      signal,
    ),
  )
  return out.recipients.map((r, i) => ({ ...r, key: r.key === '' ? `party${i}` : r.key }))
}

describe('the Board of Appeals hearing notice checklist', () => {
  it('lists the planning board and the municipal officers at the town office', async () => {
    await saveAndPublish(handle.db, world.admin, 'town_profile', 'default', {
      ...TOWN_PROFILE_SKELETON,
      addressLines: TOWN_OFFICE,
    })
    const id = await submitBoardApplication(handle.db, world, BOA_VARIANCE_TYPE, BOA_RECEIVED)
    await issueListWithRecipients(handle.db, world, id, [
      recipient(1),
      ...(await resolvedParties(id)),
    ])
    const hearing = await scheduleBoaHearing(handle.db, world, id)
    const items = await itemsOf(handle.db, hearing.noticeSetId)
    const board = await boardForKind(handle.db, 'planning_board', signal)
    const parties = items.filter((i) => i.requirementKey === 'me.boa.notice.parties')
    expect(parties.filter((i) => i.recipientAddress === TOWN_OFFICE.join(', '))).toMatchObject([
      { recipientName: board?.name, channel: 'first_class_mail', dueOn: '2027-04-08' },
      { recipientName: 'Municipal officers', channel: 'first_class_mail', dueOn: '2027-04-08' },
    ])
    expect(
      items
        .filter((i) => i.requirementKey === 'town.boa.notice.abutters')
        .map((i) => i.recipientName),
    ).toEqual(['Recipient 1'])
  })
})

async function deniedAndFiled(significant: boolean) {
  const id = await receivedSubdivision(handle.db, world, 'not_within')
  await acceptAtMeeting(handle.db, world, id)
  const made = await deniedSubdivision(handle.db, world, id, significant)
  const atVote = {
    denial: await clocksOf(handle.db, id, 'me.appeal.board_court_denial'),
    significant: await clocksOf(handle.db, id, 'me.appeal.significant_denial'),
  }
  await filedOn(handle.db, world, made, FILED)
  return { id, atVote }
}

async function decisionNodeOf(applicationId: string) {
  const nodes = await handle.db.query.appealNodes.findMany({
    where: (n, { eq: same }) => same(n.applicationId, applicationId),
  })
  const node = nodes.find((n) => n.kind === 'pb_decision')
  if (node === undefined) throw new Error('no decision node')
  return node.id
}

async function shownWindow(applicationId: string) {
  const rows = await loadGraphNodeRows(handle.db, applicationId)
  const node = rows.find((n) => n.kind === 'pb_decision')
  if (node === undefined) throw new Error('no decision node')
  return await nodeWindow(handle.db, node, signal)
}

async function petitionOn(applicationId: string, on: string) {
  const added = await addAppealNode(
    handle.db,
    world.staff,
    {
      parentId: await decisionNodeOf(applicationId),
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

describe('a Planning Board denial under the Maine pack', () => {
  it('starts only the significant denial window, at the written decision', async () => {
    const { id, atVote } = await deniedAndFiled(true)
    expect(atVote).toEqual({ denial: [], significant: [] })
    expect(await clocksOf(handle.db, id, 'me.appeal.board_court_denial')).toEqual([])
    expect(await clocksOf(handle.db, id, 'me.appeal.significant_denial')).toMatchObject([
      { status: 'running', startDate: FILED, currentDue: '2027-05-20' },
    ])
    expect(await shownWindow(id)).toMatchObject({
      dueText: formatCivilDate('2027-05-20'),
    })
    expect(await petitionOn(id, '2027-05-18')).toBe(false)
  })

  it('starts only the 30-day denial window for a decision that is not significant', async () => {
    const { id, atVote } = await deniedAndFiled(false)
    expect(atVote.significant).toEqual([])
    expect(atVote.denial).toMatchObject([
      { status: 'running', startDate: HEARING_MEETING, currentDue: '2027-05-14' },
    ])
    expect(await clocksOf(handle.db, id, 'me.appeal.significant_denial')).toEqual([])
    expect(await shownWindow(id)).toMatchObject({
      dueText: formatCivilDate('2027-05-14'),
    })
    expect(await petitionOn(id, '2027-05-18')).toBe(true)
  })
})
