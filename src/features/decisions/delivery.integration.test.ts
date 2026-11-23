import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { appealNodes, clocks } from '@/db/schema'
import { addAppealNode } from '@/features/appeals/graph'
import { startClocksFor } from '@/features/clocks/startClocks'
import { planDeliveries } from '@/features/decisions/delivery'
import { loadDeliveryGroups } from '@/features/decisions/deliveryView'
import { setActivePackForTest } from '@/features/packs/registry'
import {
  BOARD_FIXTURE_NOW,
  type BoardWorld,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  addAgentParty,
  DUE_KEY,
  decideUnderXx,
  deliver,
  deliveriesOf,
  dueClockOf,
  FULL_PACK,
  HEARING_DATE,
} from '@/test/deliveryFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld

beforeAll(() => {
  setActivePackForTest(FULL_PACK)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db, {
    zbaMeetings: [HEARING_DATE],
    pack: FULL_PACK,
    classificationKey: 'xx.board_variance',
  })
  await addAgentParty(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

describe('two decisions on one application', () => {
  it('meets only the delivery clock started for the source that was fully delivered', async () => {
    const made = await decideUnderXx(handle.db, world)
    const base = await dueClockOf(handle.db, made.applicationId)
    if (base === undefined) throw new Error('no delivery clock')
    const { id: copiedId, ...copy } = base
    expect(copiedId).not.toBe('')
    await handle.db.insert(clocks).values({
      ...copy,
      startDate: '2027-04-25',
      currentDue: '2027-05-02',
      computedDue: '2027-05-02',
    })
    const [node] = await handle.db
      .insert(appealNodes)
      .values({
        kind: 'zba_decision',
        applicationId: made.applicationId,
        occurredOn: '2027-04-25',
        outcome: 'approved',
        createdBy: world.staff.userId,
      })
      .returning({ id: appealNodes.id })
    await handle.db.transaction((tx) =>
      planDeliveries(tx, { appealNodeId: node?.id ?? '' }, signal),
    )
    const all = await deliveriesOf(handle.db, made.applicationId)
    const originals = all.filter((r) => r.decisionId !== null)
    const replacements = all.filter((r) => r.appealNodeId !== null)
    expect(replacements).toHaveLength(4)
    for (const row of originals) {
      expect((await deliver(handle.db, world.staff, row.id, '2027-04-17')).ok).toBe(true)
    }
    const afterFirst = (
      await handle.db.select().from(clocks).where(eq(clocks.applicationId, made.applicationId))
    ).filter((c) => c.ruleKey === base.ruleKey)
    expect(afterFirst.find((c) => c.startDate === HEARING_DATE)?.status).toBe('met')
    expect(afterFirst.find((c) => c.startDate === '2027-04-25')?.status).toBe('running')
    for (const row of replacements) {
      expect((await deliver(handle.db, world.staff, row.id, '2027-04-27')).ok).toBe(true)
    }
    const afterSecond = (
      await handle.db.select().from(clocks).where(eq(clocks.applicationId, made.applicationId))
    ).find((c) => c.startDate === '2027-04-25' && c.ruleKey === base.ruleKey)
    expect(afterSecond).toMatchObject({ status: 'met', metOn: '2027-04-27' })
  })
})

describe('an appeal decision during the original delivery period', () => {
  it('starts its own delivery clock while the original one runs and meets each on its own rows', async () => {
    const made = await decideUnderXx(handle.db, world)
    const [pb] = await handle.db
      .insert(appealNodes)
      .values({
        kind: 'pb_decision',
        applicationId: made.applicationId,
        occurredOn: '2027-04-01',
        createdBy: world.staff.userId,
      })
      .returning({ id: appealNodes.id })
    const [appeal] = await handle.db
      .insert(appealNodes)
      .values({
        kind: 'zba_appeal',
        applicationId: made.applicationId,
        parentId: pb?.id,
        linkedPbNodeId: pb?.id,
        occurredOn: '2027-04-05',
        createdBy: world.staff.userId,
      })
      .returning({ id: appealNodes.id })
    const added = await addAppealNode(
      handle.db,
      world.staff,
      {
        parentId: appeal?.id ?? '',
        kind: 'zba_decision',
        occurredOn: d('2027-04-18'),
        outcome: 'approved',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    if (!added.ok) throw new Error(`not added: ${added.error}`)
    const dueClocks = async () =>
      (await handle.db.select().from(clocks).where(eq(clocks.applicationId, made.applicationId)))
        .filter((c) => c.ruleKey === DUE_KEY)
        .map((c) => ({ startDate: c.startDate, status: c.status, currentDue: c.currentDue }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
    expect(await dueClocks()).toEqual([
      { startDate: HEARING_DATE, status: 'running', currentDue: '2027-04-22' },
      { startDate: '2027-04-18', status: 'running', currentDue: '2027-04-25' },
    ])
    const groups = await loadDeliveryGroups(handle.db, made.applicationId, signal)
    expect(groups.map((g) => [g.source, g.dueText])).toEqual([
      ['decision', 'April 22, 2027'],
      ['appeal', 'April 25, 2027'],
    ])
    const rows = await deliveriesOf(handle.db, made.applicationId)
    for (const row of rows.filter((r) => r.appealNodeId === added.value.nodeId)) {
      expect((await deliver(handle.db, world.staff, row.id, '2027-04-20')).ok).toBe(true)
    }
    expect(await dueClocks()).toEqual([
      { startDate: HEARING_DATE, status: 'running', currentDue: '2027-04-22' },
      { startDate: '2027-04-18', status: 'met', currentDue: '2027-04-25' },
    ])
  })
})

describe('a second board vote during the original delivery period', () => {
  it('starts a delivery clock for the later vote and none twice for the same vote', async () => {
    const made = await decideUnderXx(handle.db, world)
    for (const on of ['2027-04-19', '2027-04-19', HEARING_DATE]) {
      await handle.db.transaction((tx) =>
        startClocksFor(tx, made.applicationId, 'board_vote', d(on), signal, undefined, undefined, {
          outcome: 'approved',
        }),
      )
    }
    const starts = (
      await handle.db.select().from(clocks).where(eq(clocks.applicationId, made.applicationId))
    )
      .filter((c) => c.ruleKey === DUE_KEY)
      .map((c) => [c.startDate, c.status])
      .sort()
    expect(starts).toEqual([
      [HEARING_DATE, 'running'],
      ['2027-04-19', 'running'],
    ])
  })
})

describe('a linked component decision on the appeal chain', () => {
  it('plans rows and starts the delivery clock without starting other board vote clocks', async () => {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.zbaTypeKey,
      '2027-03-02',
    )
    const [pb] = await handle.db
      .insert(appealNodes)
      .values({
        kind: 'pb_decision',
        applicationId,
        occurredOn: '2027-03-20',
        createdBy: world.staff.userId,
      })
      .returning({ id: appealNodes.id })
    const [appeal] = await handle.db
      .insert(appealNodes)
      .values({
        kind: 'zba_appeal',
        applicationId,
        parentId: pb?.id,
        linkedPbNodeId: pb?.id,
        occurredOn: '2027-04-01',
        createdBy: world.staff.userId,
      })
      .returning({ id: appealNodes.id })
    const added = await addAppealNode(
      handle.db,
      world.staff,
      {
        parentId: appeal?.id ?? '',
        kind: 'zba_decision',
        occurredOn: d('2027-04-10'),
        outcome: 'approved',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    if (!added.ok) throw new Error(`not added: ${added.error}`)
    expect(await deliveriesOf(handle.db, applicationId)).toHaveLength(4)
    expect(await dueClockOf(handle.db, applicationId)).toMatchObject({
      status: 'running',
      currentDue: '2027-04-17',
    })
  })
})

describe('a decision recorded on the appeal chain', () => {
  async function appealStep() {
    const applicationId = await submitBoardApplication(
      handle.db,
      world,
      world.zbaTypeKey,
      '2027-03-02',
    )
    const [appeal] = await handle.db
      .insert(appealNodes)
      .values({
        kind: 'zba_appeal',
        applicationId,
        occurredOn: '2027-04-01',
        createdBy: world.staff.userId,
      })
      .returning({ id: appealNodes.id })
    return { applicationId, appealId: appeal?.id ?? '' }
  }

  it('plans rows for the node and meets the clock on the latest delivery', async () => {
    const { applicationId, appealId } = await appealStep()
    const added = await addAppealNode(
      handle.db,
      world.staff,
      {
        parentId: appealId,
        kind: 'zba_decision',
        occurredOn: d('2027-04-10'),
        outcome: 'approved',
      },
      signal,
      BOARD_FIXTURE_NOW,
    )
    if (!added.ok) throw new Error(`not added: ${added.error}`)
    const rows = await deliveriesOf(handle.db, applicationId)
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.appealNodeId === added.value.nodeId && r.decisionId === null)).toBe(
      true,
    )
    expect((await dueClockOf(handle.db, applicationId))?.currentDue).toBe('2027-04-17')
    for (const [i, row] of rows.entries()) {
      expect((await deliver(handle.db, world.staff, row.id, `2027-04-${12 + i}`)).ok).toBe(true)
    }
    expect(await dueClockOf(handle.db, applicationId)).toMatchObject({
      status: 'met',
      metOn: '2027-04-15',
    })
    const groups = await loadDeliveryGroups(handle.db, applicationId, signal)
    expect(groups[0]?.title).toContain('after appeal')
  })

  it('plans nothing for a step that is not a decision', async () => {
    const { applicationId } = await appealStep()
    expect(await deliveriesOf(handle.db, applicationId)).toEqual([])
  })
})
