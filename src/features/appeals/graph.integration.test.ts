import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appealNodes, applications, clocks, recordEvents } from '@/db/schema'
import { addAdministrativeDecision } from '@/features/appeals/adminAppeals'
import { finality } from '@/features/appeals/finality'
import { addAppealNode } from '@/features/appeals/graph'
import { recordDecision } from '@/features/decisions/recordDecision'
import type { ObjectStore } from '@/features/storage/objectStore'
import { closeAppealPeriods } from '@/jobs/appealsDaily'
import { makeApplication } from '@/test/applicationFixtures'
import { BOARD_FIXTURE_NOW, type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { decidedZba, FIXTURE_VOTES, heldPbHearing } from '@/test/hearingFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld
let store: ObjectStore

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, { zbaMeetings: ['2027-04-15'] })
  store = (await makeTestStore()).store
})
afterEach(async () => {
  await handle.drop()
})

async function nodesOf(applicationId: string) {
  return await handle.db
    .select()
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
}

async function zbaDecisionNode() {
  const made = await decidedZba(handle.db, world, store, { documents: false })
  const [node] = (await nodesOf(made.applicationId)).filter((n) => n.kind === 'zba_decision')
  if (node === undefined) throw new Error('no zba_decision node')
  return { ...made, nodeId: node.id }
}

async function add(
  parentId: string,
  kind: Parameters<typeof addAppealNode>[2]['kind'],
  occurredOn: string,
  extra: Partial<Parameters<typeof addAppealNode>[2]> = {},
) {
  return await addAppealNode(
    handle.db,
    world.staff,
    { parentId, kind, occurredOn: d(occurredOn), ...extra },
    signal,
    BOARD_FIXTURE_NOW,
  )
}

async function nodeOf(id: string) {
  const [row] = await handle.db.select().from(appealNodes).where(eq(appealNodes.id, id))
  if (row === undefined) throw new Error('no node')
  return row
}

describe('decision nodes', () => {
  it('recording a zba decision creates a zba_decision node on the vote date', async () => {
    const made = await zbaDecisionNode()
    expect(await nodeOf(made.nodeId)).toMatchObject({
      kind: 'zba_decision',
      occurredOn: '2027-04-15',
      outcome: 'approved',
      status: 'open',
      decisionId: made.decisionId,
    })
  })

  it('recording a planning board decision creates a pb_decision node', async () => {
    const held = await heldPbHearing(handle.db, world)
    await recordDecision(
      handle.db,
      world.staff,
      {
        applicationId: held.applicationId,
        hearingId: held.hearingId,
        votedOn: d('2027-06-09'),
        outcome: 'approved',
        motion: 'Approve.',
        votes: FIXTURE_VOTES,
        findings: 'Meets the regulations.',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect((await nodesOf(held.applicationId)).map((n) => n.kind)).toEqual(['pb_decision'])
  })
})

describe('zba rehearing and court', () => {
  it('rehearing motion on 2027-05-17 is timely after a 2027-04-15 vote', async () => {
    const { nodeId } = await zbaDecisionNode()
    const added = await add(nodeId, 'rehearing_motion', '2027-05-17')
    if (!added.ok) throw new Error(added.error)
    expect((await nodeOf(added.value.nodeId)).untimely).toBe(false)
  })

  it('rehearing motion on 2027-05-18 is recorded untimely', async () => {
    const { nodeId } = await zbaDecisionNode()
    const added = await add(nodeId, 'rehearing_motion', '2027-05-18')
    if (!added.ok) throw new Error(added.error)
    expect(await nodeOf(added.value.nodeId)).toMatchObject({ untimely: true, status: 'open' })
  })

  it('a timely rehearing motion meets the rehearing window clock', async () => {
    const { nodeId, applicationId } = await zbaDecisionNode()
    await add(nodeId, 'rehearing_motion', '2027-05-10')
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, applicationId))
    expect(rows.find((c) => c.ruleKey === 'nh.appeal.zba_rehearing')).toMatchObject({
      status: 'met',
      metOn: '2027-05-10',
    })
  })

  it('rehearing denied 2027-05-20 opens a court window due 2027-06-21', async () => {
    const { nodeId, applicationId } = await zbaDecisionNode()
    const motion = await add(nodeId, 'rehearing_motion', '2027-05-10')
    if (!motion.ok) throw new Error(motion.error)
    const outcome = await add(motion.value.nodeId, 'rehearing_outcome', '2027-05-20', {
      outcome: 'denied',
    })
    if (!outcome.ok) throw new Error(outcome.error)
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, applicationId))
    expect(rows.find((c) => c.ruleKey === 'nh.appeal.zba_court')).toMatchObject({
      currentDue: '2027-06-21',
      status: 'running',
    })
    const late = await add(outcome.value.nodeId, 'court_petition', '2027-06-22')
    if (!late.ok) throw new Error(late.error)
    expect((await nodeOf(late.value.nodeId)).untimely).toBe(true)
  })

  it('rehearing granted leads to a new zba decision with its own rehearing window', async () => {
    const { nodeId, applicationId } = await zbaDecisionNode()
    const motion = await add(nodeId, 'rehearing_motion', '2027-05-10')
    if (!motion.ok) throw new Error(motion.error)
    const outcome = await add(motion.value.nodeId, 'rehearing_outcome', '2027-05-20', {
      outcome: 'granted',
    })
    if (!outcome.ok) throw new Error(outcome.error)
    expect(await add(outcome.value.nodeId, 'court_petition', '2027-06-01')).toEqual({
      ok: false,
      error: 'route_not_allowed',
    })
    const again = await add(outcome.value.nodeId, 'zba_decision', '2027-06-24', {
      outcome: 'approved',
    })
    if (!again.ok) throw new Error(again.error)
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(
        and(eq(clocks.applicationId, applicationId), eq(clocks.ruleKey, 'nh.appeal.zba_rehearing')),
      )
    expect(rows.find((c) => c.startDate === '2027-06-24')?.currentDue).toBe('2027-07-26')
  })

  it('a rehearing outcome needs an outcome', async () => {
    const { nodeId } = await zbaDecisionNode()
    const motion = await add(nodeId, 'rehearing_motion', '2027-05-10')
    if (!motion.ok) throw new Error(motion.error)
    expect(await add(motion.value.nodeId, 'rehearing_outcome', '2027-05-20')).toEqual({
      ok: false,
      error: 'wrong_outcome',
    })
  })
})

describe('planning board routes', () => {
  async function pbDecision() {
    const held = await heldPbHearing(handle.db, world)
    await recordDecision(
      handle.db,
      world.staff,
      {
        applicationId: held.applicationId,
        hearingId: held.hearingId,
        votedOn: d('2027-06-09'),
        outcome: 'approved',
        motion: 'Approve.',
        votes: FIXTURE_VOTES,
        findings: 'Meets the regulations.',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    const [node] = await nodesOf(held.applicationId)
    return { ...held, nodeId: node?.id ?? '' }
  }

  it('planning board decision has no rehearing route', async () => {
    const { nodeId } = await pbDecision()
    expect(await add(nodeId, 'rehearing_motion', '2027-06-20')).toEqual({
      ok: false,
      error: 'route_not_allowed',
    })
  })

  it('a court petition on a planning board decision is timely on 2027-07-09', async () => {
    const { nodeId } = await pbDecision()
    const added = await add(nodeId, 'court_petition', '2027-07-09')
    if (!added.ok) throw new Error(added.error)
    expect(await nodeOf(added.value.nodeId)).toMatchObject({ untimely: false, status: 'open' })
  })

  it('refuses a court petition dated before the planning board decision it follows and records nothing', async () => {
    const { nodeId, applicationId } = await pbDecision()
    const before = (await nodesOf(applicationId)).length
    expect(await add(nodeId, 'court_petition', '2020-01-01')).toEqual({
      ok: false,
      error: 'before_parent',
    })
    expect((await nodesOf(applicationId)).length).toBe(before)
  })

  it('accepts a court petition dated the same day as the decision', async () => {
    const { nodeId } = await pbDecision()
    const decided = (await nodeOf(nodeId)).occurredOn
    const added = await add(nodeId, 'court_petition', decided)
    expect(added.ok).toBe(true)
  })

  it('refuses a second court petition on the same parent and records nothing', async () => {
    const { nodeId, applicationId } = await pbDecision()
    const decided = (await nodeOf(nodeId)).occurredOn
    const first = await add(nodeId, 'court_petition', decided)
    if (!first.ok) throw new Error(first.error)
    const before = (await nodesOf(applicationId)).length
    expect(await add(nodeId, 'court_petition', decided)).toEqual({
      ok: false,
      error: 'duplicate_step',
    })
    expect((await nodesOf(applicationId)).length).toBe(before)
  })

  it('court petition while a linked zba component is open is stayed', async () => {
    const { nodeId } = await pbDecision()
    const linked = await add(nodeId, 'zba_appeal', '2027-06-20', { linkedComponent: true })
    if (!linked.ok) throw new Error(linked.error)
    expect(await nodeOf(linked.value.nodeId)).toMatchObject({
      linkedPbNodeId: nodeId,
      status: 'open',
    })
    const petition = await add(nodeId, 'court_petition', '2027-07-01')
    if (!petition.ok) throw new Error(petition.error)
    expect((await nodeOf(petition.value.nodeId)).status).toBe('stayed')
  })

  it('an unlinked zba appeal of a planning board decision is not a route', async () => {
    const { nodeId } = await pbDecision()
    expect(await add(nodeId, 'zba_appeal', '2027-06-20')).toEqual({
      ok: false,
      error: 'route_not_allowed',
    })
  })

  it('linked component rehearing denied 2027-08-19 opens the planning board court window due 2027-09-20', async () => {
    const { nodeId, applicationId } = await pbDecision()
    const linked = await add(nodeId, 'zba_appeal', '2027-06-20', { linkedComponent: true })
    if (!linked.ok) throw new Error(linked.error)
    const decision = await add(linked.value.nodeId, 'zba_decision', '2027-07-15', {
      outcome: 'denied',
    })
    if (!decision.ok) throw new Error(decision.error)
    const motion = await add(decision.value.nodeId, 'rehearing_motion', '2027-08-05')
    if (!motion.ok) throw new Error(motion.error)
    const outcome = await add(motion.value.nodeId, 'rehearing_outcome', '2027-08-19', {
      outcome: 'denied',
    })
    if (!outcome.ok) throw new Error(outcome.error)
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, applicationId))
    expect(rows.find((c) => c.ruleKey === 'nh.appeal.pb_court_after_zba')).toMatchObject({
      startDate: '2027-08-19',
      currentDue: '2027-09-20',
    })
    const petition = await add(outcome.value.nodeId, 'court_petition', '2027-09-20')
    if (!petition.ok) throw new Error(petition.error)
    expect(await nodeOf(petition.value.nodeId)).toMatchObject({ untimely: false, parentId: nodeId })
  })
})

describe('administrative decisions and issued permits', () => {
  it('refuses an administrative decision dated after today', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'issued' })
    const result = await addAdministrativeDecision(
      handle.db,
      world.staff,
      { applicationId: permit.applicationId, occurredOn: d('2028-01-04'), now: BOARD_FIXTURE_NOW },
      signal,
    )
    expect(result.ok ? null : result.error).toBe('future_date')
  })

  it('zba appeal of an issued building permit suspends it', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'issued' })
    const root = await addAdministrativeDecision(
      handle.db,
      world.staff,
      { applicationId: permit.applicationId, occurredOn: d('2027-03-01'), now: BOARD_FIXTURE_NOW },
      signal,
    )
    if (!root.ok) throw new Error(root.error)
    const appeal = await add(root.value.nodeId, 'zba_appeal', '2027-03-20')
    if (!appeal.ok) throw new Error(appeal.error)
    const [row] = await handle.db
      .select()
      .from(applications)
      .where(eq(applications.id, permit.applicationId))
    expect(row?.state).toBe('suspended')
    expect((await nodeOf(appeal.value.nodeId)).untimely).toBe(false)
  })

  it('an administrative appeal on 2027-04-01 is untimely after a 2027-03-01 decision', async () => {
    const permit = await makeApplication(handle.db, world, { state: 'issued' })
    const root = await addAdministrativeDecision(
      handle.db,
      world.staff,
      { applicationId: permit.applicationId, occurredOn: d('2027-03-01'), now: BOARD_FIXTURE_NOW },
      signal,
    )
    if (!root.ok) throw new Error(root.error)
    const appeal = await add(root.value.nodeId, 'zba_appeal', '2027-04-01')
    if (!appeal.ok) throw new Error(appeal.error)
    expect((await nodeOf(appeal.value.nodeId)).untimely).toBe(true)
  })

  it('a reviewer cannot add nodes', async () => {
    const { nodeId } = await zbaDecisionNode()
    const result = await addAppealNode(
      handle.db,
      world.reviewer,
      { parentId: nodeId, kind: 'rehearing_motion', occurredOn: d('2027-05-10') },
      signal,
      BOARD_FIXTURE_NOW,
    )
    expect(result).toEqual({ ok: false, error: 'forbidden' })
  })
})

describe('finality and the daily job', () => {
  it('within the window the decision is not final', async () => {
    const { applicationId } = await zbaDecisionNode()
    const result = await finality(handle.db, applicationId, d('2027-05-01'), signal)
    expect(result).toMatchObject({ final: false, finalOn: null, appealPeriodEndsOn: '2027-05-17' })
  })

  it('after the window with no filing the decision is final from the vote date', async () => {
    const { applicationId } = await zbaDecisionNode()
    await closeAppealPeriods(handle.db as never, d('2027-05-18'), signal)
    const result = await finality(handle.db, applicationId, d('2027-05-18'), signal)
    expect(result).toMatchObject({
      final: true,
      finalOn: '2027-04-15',
      appealPeriodEndsOn: '2027-05-17',
    })
  })

  it('an open rehearing motion keeps the decision from becoming final', async () => {
    const { applicationId, nodeId } = await zbaDecisionNode()
    await add(nodeId, 'rehearing_motion', '2027-05-10')
    await closeAppealPeriods(handle.db as never, d('2027-05-18'), signal)
    const result = await finality(handle.db, applicationId, d('2027-05-18'), signal)
    expect(result.final).toBe(false)
    expect(result.open.map((o) => o.kind)).toEqual(['rehearing_motion'])
  })

  it('appeal period with no filing ends and records appeal_period_expired once', async () => {
    const { applicationId } = await zbaDecisionNode()
    await handle.db.transaction((tx) => closeAppealPeriods(tx, d('2027-05-18'), signal))
    await handle.db.transaction((tx) => closeAppealPeriods(tx, d('2027-05-19'), signal))
    const events = await handle.db
      .select()
      .from(recordEvents)
      .where(eq(recordEvents.applicationId, applicationId))
    expect(events.filter((e) => e.kind === 'appeal_period_expired')).toHaveLength(1)
  })

  it('approved variance becomes final and starts the exercise clock from the vote date', async () => {
    const { applicationId } = await zbaDecisionNode()
    await handle.db.transaction((tx) => closeAppealPeriods(tx, d('2027-05-18'), signal))
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, applicationId))
    expect(rows.find((c) => c.ruleKey === 'nh.zba.exercise')).toMatchObject({
      startDate: '2027-04-15',
      currentDue: '2029-04-15',
    })
  })

  it('a replacement denial after a granted rehearing never becomes a final approval', async () => {
    const { applicationId, nodeId } = await zbaDecisionNode()
    const motion = await add(nodeId, 'rehearing_motion', '2027-05-10')
    if (!motion.ok) throw new Error(motion.error)
    const outcome = await add(motion.value.nodeId, 'rehearing_outcome', '2027-05-20', {
      outcome: 'granted',
    })
    if (!outcome.ok) throw new Error(outcome.error)
    const replacement = await add(outcome.value.nodeId, 'zba_decision', '2027-06-24', {
      outcome: 'denied',
    })
    if (!replacement.ok) throw new Error(replacement.error)
    await handle.db.transaction((tx) => closeAppealPeriods(tx, d('2027-08-01'), signal))
    const result = await finality(handle.db, applicationId, d('2027-08-01'), signal)
    expect(result).toMatchObject({ final: true, finalOn: null })
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, applicationId))
    expect(rows.find((c) => c.ruleKey === 'nh.zba.exercise')).toBeUndefined()
  })

  it('a window still running on the job date is left alone', async () => {
    const { applicationId } = await zbaDecisionNode()
    await handle.db.transaction((tx) => closeAppealPeriods(tx, d('2027-05-17'), signal))
    const rows = await handle.db
      .select()
      .from(clocks)
      .where(eq(clocks.applicationId, applicationId))
    expect(rows.find((c) => c.ruleKey === 'nh.appeal.zba_rehearing')?.status).toBe('running')
    expect(rows.find((c) => c.ruleKey === 'nh.zba.exercise')).toBeUndefined()
  })

  it('daily job twice in a day has one effect', async () => {
    const { applicationId } = await zbaDecisionNode()
    const first = await handle.db.transaction((tx) =>
      closeAppealPeriods(tx, d('2027-05-18'), signal),
    )
    const second = await handle.db.transaction((tx) =>
      closeAppealPeriods(tx, d('2027-05-18'), signal),
    )
    expect(first.closed).toEqual([applicationId])
    expect(second.closed).toEqual([])
  })
})
