import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  type EnforcementStatus,
  enforcementCases,
  enforcementOrders,
  orderServiceRecipients,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { listCasePage } from '@/features/enforcement/caseList'
import { readCasesView } from '@/features/enforcement/caseListParams'
import { openCase } from '@/features/enforcement/cases'
import { loadEnforcementSection } from '@/features/staffHome/enforcementHome'
import { makeTestDb, type TestDb } from '@/test/db'
import { homeContextFor, rowCount, rowHref, searchOf } from '@/test/homeFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T03:00:00Z')
const OVERDUE = 'Open cases past a deadline'
const MINE = 'Open cases assigned to you'
const UNASSIGNED = 'Open cases with no one assigned'
let handle: TestDb
let staff: Actor
let inspector: Actor
let orders = 0

async function caseWith(status: EnforcementStatus, assignedTo: string | null, due?: string) {
  const opened = await openCase(
    handle.db,
    staff,
    { locationText: `${orders} Elm Street` },
    signal,
    NOW,
  )
  if (!opened.ok) throw new Error('open failed')
  const caseId = opened.value.caseId
  await handle.db
    .update(enforcementCases)
    .set({ status, assignedTo })
    .where(eq(enforcementCases.id, caseId))
  if (due === undefined) return
  orders += 1
  const [order] = await handle.db
    .insert(enforcementOrders)
    .values({
      caseId,
      number: `EO-${orders}`,
      ruleKey: 'nh.enf.cd_zoning',
      ruleVersion: 1,
      correctiveAction: 'Remove it',
      draftedBy: staff.userId,
    })
    .returning({ id: enforcementOrders.id })
  await handle.db.insert(orderServiceRecipients).values({
    orderId: order?.id ?? '',
    role: 'record_owner',
    name: 'Pat Owner',
    address: '1 Main St',
    source: 'CAMA owner',
    answerDue: { due },
  })
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  inspector = await staffActor(handle.db, 'inspector')
  await caseWith('investigating', staff.userId, '2027-02-20')
  await caseWith('order_issued', inspector.userId, '2027-02-25')
  await caseWith('closed', null, '2027-02-20')
  await caseWith('intake', null)
  await caseWith('in_court', staff.userId, '2027-03-20')
  await caseWith('violation_found', inspector.userId, '2027-03-01')
})
afterAll(async () => {
  await handle.drop()
})

async function pageTotal(href: string, actor: Actor, today: CivilDate): Promise<number> {
  const { filters } = readCasesView(searchOf(href))
  const page = await listCasePage(
    handle.db,
    actor,
    { filters, limit: 25, offset: 0 },
    today,
    signal,
  )
  return page.total
}

describe('the Enforcement card on Today', () => {
  it('counts open cases overdue, assigned to the viewer and unassigned, in the town time zone', async () => {
    const section = await loadEnforcementSection(await homeContextFor(handle.db, staff, NOW))
    expect(rowCount(section, OVERDUE)).toBe(2)
    expect(rowCount(section, MINE)).toBe(2)
    expect(rowCount(section, UNASSIGNED)).toBe(1)
  })

  it('links each count to the case list filtered to exactly those rows', async () => {
    const ctx = await homeContextFor(handle.db, inspector, NOW)
    const section = await loadEnforcementSection(ctx)
    for (const label of [OVERDUE, MINE, UNASSIGNED]) {
      const href = rowHref(section, label)
      expect(href.startsWith('/staff/enforcement?')).toBe(true)
      expect(await pageTotal(href, inspector, ctx.today)).toBe(rowCount(section, label))
    }
    expect(rowCount(section, MINE)).toBe(2)
  })

  it('is absent for a viewer who cannot open the case list', async () => {
    const custodian = await staffActor(handle.db, 'records_custodian')
    expect(await loadEnforcementSection(await homeContextFor(handle.db, custodian, NOW))).toBeNull()
  })
})
