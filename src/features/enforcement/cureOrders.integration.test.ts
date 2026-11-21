import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { enforcementCases, enforcementOrders } from '@/db/schema'
import { listCasePage } from '@/features/enforcement/caseList'
import type { CaseListFilters, CaseSortKey } from '@/features/enforcement/caseListParams'
import { applyCureProcedure } from '@/features/enforcement/cureNotices'
import { designateEnforcementOfficer } from '@/features/enforcement/designations'
import { withdrawFinding } from '@/features/enforcement/findingChanges'
import { issueBlock } from '@/features/enforcement/orderIssueChecks'
import { draftOrder, issueOrder } from '@/features/enforcement/orders'
import { setActivePackForTest } from '@/features/packs/registry'
import { type CureHelpers, cureHelpers } from '@/test/cureFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  FIXTURE_NOW,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { sendFixtureNotice } from '@/test/enforcementNoticeFixture'
import { makeTestStore } from '@/test/objectStore'
import { XX_CURE, XX_CURE_RULE_KEY } from '@/test/packs/xx/cure'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: EnforcementWorld
let cure: CureHelpers

beforeAll(() => {
  setActivePackForTest(XX_CURE)
})
afterAll(() => {
  setActivePackForTest(null)
})
beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupEnforcementWorld(handle.db)
  cure = cureHelpers(handle.db, world)
})
afterEach(async () => {
  await handle.drop()
})

async function drafted(caseId: string, findingIds: string[]) {
  const made = await draftOrder(
    handle.db,
    world.staff,
    {
      caseId,
      findingIds,
      correctiveAction: 'Replant the shoreland strip.',
      correctiveDeadline: '2027-05-15',
      ceaseImmediately: false,
    },
    signal,
    FIXTURE_NOW,
  )
  if (!made.ok) throw new Error(`draft: ${JSON.stringify(made.error)}`)
  const [order] = await handle.db
    .select()
    .from(enforcementOrders)
    .where(eq(enforcementOrders.id, made.value.orderId))
  if (order === undefined) throw new Error('draft not stored')
  return order
}

const choose = (caseId: string) =>
  applyCureProcedure(handle.db, world.staff, { caseId, ruleKey: XX_CURE_RULE_KEY }, signal)

describe('choosing the cure procedure after other enforcement work', () => {
  it('refuses once a notice of violation is sent', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    const store = (await makeTestStore()).store
    await sendFixtureNotice(handle.db, store, world.staff, {
      caseId,
      findingId: findingIds[0] ?? '',
      sentOn: '2027-02-26',
    })
    expect(await choose(caseId)).toEqual({ ok: false, error: 'notice_sent' })
  })

  it('refuses once an order is drafted', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await drafted(caseId, findingIds)
    expect(await choose(caseId)).toEqual({ ok: false, error: 'notice_sent' })
  })
})

describe('an order under a cure procedure', () => {
  it('needs the cure notice and then accepts it as the notice of violation', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    const order = await drafted(caseId, findingIds)
    const before = await handle.db.transaction((tx) => issueBlock(tx, order, '2027-03-12'))
    expect(before).toBe('notice_required')
    await cure.send(caseId, findingIds)
    const after = await handle.db.transaction((tx) => issueBlock(tx, order, '2027-03-12'))
    expect(after).toBeNull()
  })

  it('is issued after the cure period with no notice of violation on the case', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    await cure.send(caseId, findingIds)
    const designated = await designateEnforcementOfficer(
      handle.db,
      world.admin,
      {
        userId: world.staff.userId,
        title: 'Code Enforcement Officer',
        adoptingAuthority: 'Select Board',
        adoptedOn: '2027-01-05',
      },
      signal,
    )
    expect(designated.ok).toBe(true)
    const order = await drafted(caseId, findingIds)
    const store = (await makeTestStore()).store
    const issued = await issueOrder(
      handle.db,
      store,
      world.staff,
      { orderId: order.id, issuedOn: '2027-03-12', expectedRowVersion: order.rowVersion },
      signal,
      new Date('2027-03-12T15:00:00Z'),
    )
    expect(issued.ok).toBe(true)
    const [row] = await handle.db
      .select({ status: enforcementCases.status })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, caseId))
    expect(row?.status).toBe('order_issued')
  })

  it('is offered with the remedies once the cure period ran, then asks to issue the draft', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    await cure.send(caseId, findingIds)
    const lapsed = await cure.planOn(caseId, d('2027-03-12'))
    expect(lapsed.remedies.map((a) => a.kind)).toContain('draft_order')
    const rows = new Map(lapsed.groups.flatMap((g) => g.rows).map((r) => [r.key, r.done]))
    expect(rows.get('notice.sent')).toBe(true)
    const order = await drafted(caseId, findingIds)
    const next = await cure.planOn(caseId, d('2027-03-12'))
    expect(next.now?.action).toEqual({ kind: 'issue_order', orderId: order.id })
  })
})

describe('withdrawing a cure-noticed finding', () => {
  it('keeps the case at violation found', async () => {
    const { caseId, findingIds } = await cure.foundCase()
    await cure.chooseCure(caseId)
    await cure.send(caseId, findingIds)
    const withdrawn = await withdrawFinding(
      handle.db,
      world.staff,
      { findingId: findingIds[0] ?? '', reason: 'Measured again; within the strip.' },
      signal,
    )
    expect(withdrawn).toEqual({ ok: true, value: { caseStatus: 'violation_found' } })
    const [row] = await handle.db
      .select({ status: enforcementCases.status })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, caseId))
    expect(row?.status).toBe('violation_found')
  })
})

describe('the case list due filter and sort for cure cases', () => {
  it('lists a running cure period as due and sorts it among dated cases', async () => {
    const noticed = await cure.foundCase()
    await cure.chooseCure(noticed.caseId)
    await cure.send(noticed.caseId, noticed.findingIds)
    const plain = await cure.foundCase()
    const ids = async (filters: CaseListFilters, sort?: { key: CaseSortKey; dir: 'asc' }) => {
      const page = await listCasePage(
        handle.db,
        world.staff,
        { filters, ...(sort === undefined ? {} : { sort }), limit: 10, offset: 0 },
        d('2027-03-05'),
        signal,
      )
      return page.rows.map((r) => r.caseId)
    }
    expect(await ids({ due: ['none'] })).toEqual([plain.caseId])
    expect(await ids({ due: ['week'] })).toEqual([noticed.caseId])
    expect(await ids({}, { key: 'next', dir: 'asc' })).toEqual([noticed.caseId, plain.caseId])
  })
})
