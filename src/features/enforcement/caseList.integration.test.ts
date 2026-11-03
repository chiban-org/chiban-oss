import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  enforcementAppeals,
  enforcementCases,
  enforcementOrders,
  orderServiceRecipients,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { caseListFacets, listCasePage } from '@/features/enforcement/caseList'
import type { CaseListFilters, CaseSortKey } from '@/features/enforcement/caseListParams'
import { listCaseQueue } from '@/features/enforcement/caseQueue'
import { openCase } from '@/features/enforcement/cases'
import { stayFor } from '@/features/enforcement/stay'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const TODAY = '2027-03-02' as CivilDate
let handle: TestDb
let staff: Actor
let other: Actor
let alder = ''
let birch = ''
let cedar = ''
let dune = ''
let elm = ''

async function open(location: string): Promise<string> {
  const result = await openCase(handle.db, staff, { locationText: location }, signal, NOW)
  if (!result.ok) throw new Error('open failed')
  return result.value.caseId
}

async function answerDue(caseId: string, number: string, due: string, answeredOn?: string) {
  const [order] = await handle.db
    .insert(enforcementOrders)
    .values({
      caseId,
      number,
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
    ...(answeredOn === undefined ? {} : { answeredOn }),
  })
  return order?.id ?? ''
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  other = await staffActor(handle.db, 'inspector')
  alder = await open('9 Alder Road')
  birch = await open('14 Birch Lane')
  cedar = await open('3 Cedar Court')
  dune = await open('70 Dune Street')
  elm = await open('5 Elm Street')
  await handle.db
    .update(enforcementCases)
    .set({ status: 'investigating', openedOn: '2027-02-10' })
    .where(eq(enforcementCases.id, alder))
  await handle.db
    .update(enforcementCases)
    .set({ status: 'order_issued', openedOn: '2027-01-05', assignedTo: other.userId })
    .where(eq(enforcementCases.id, birch))
  await handle.db
    .update(enforcementCases)
    .set({ status: 'closed', openedOn: '2026-12-20', assignedTo: null })
    .where(eq(enforcementCases.id, cedar))
  await handle.db
    .update(enforcementCases)
    .set({ status: 'in_court', openedOn: '2027-02-10', assignedTo: null })
    .where(eq(enforcementCases.id, dune))
  const birchOrder = await answerDue(birch, 'EO-1', '2027-03-05')
  await answerDue(dune, 'EO-2', '2027-02-20')
  await answerDue(dune, 'EO-3', '2027-03-20')
  await answerDue(elm, 'EO-4', '2027-02-25', '2027-02-26')
  await handle.db.insert(enforcementAppeals).values({
    caseId: birch,
    targetKind: 'order',
    targetId: birchOrder,
    filedOn: '2027-02-28',
    appellantName: 'Pat Owner',
    recordedBy: staff.userId,
  })
})
afterAll(async () => {
  await handle.drop()
})

async function ids(
  options: {
    filters?: CaseListFilters
    sort?: { key: CaseSortKey; dir: 'asc' | 'desc' }
    limit?: number
    offset?: number
  } = {},
) {
  const page = await listCasePage(
    handle.db,
    staff,
    {
      filters: options.filters ?? {},
      ...(options.sort === undefined ? {} : { sort: options.sort }),
      limit: options.limit ?? 25,
      offset: options.offset ?? 0,
    },
    TODAY,
    signal,
  )
  return page.rows.map((r) => r.caseId)
}
const by = (key: CaseSortKey, dir: 'asc' | 'desc') => ({ sort: { key, dir } })

describe('enforcement case list sorting', () => {
  it('opens with the newest case number first', async () => {
    expect(await ids()).toEqual([elm, dune, cedar, birch, alder])
  })

  it('sorts by case number ascending and by location', async () => {
    expect(await ids(by('number', 'asc'))).toEqual([alder, birch, cedar, dune, elm])
    expect(await ids(by('where', 'asc'))).toEqual([birch, cedar, elm, dune, alder])
  })

  it('sorts by status in case order with the newest number inside a tie', async () => {
    expect(await ids(by('status', 'asc'))).toEqual([elm, alder, birch, dune, cedar])
  })

  it('sorts by opened date with the newest number inside a tie', async () => {
    expect(await ids(by('opened', 'desc'))).toEqual([elm, dune, alder, birch, cedar])
    expect(await ids(by('opened', 'asc'))).toEqual([cedar, birch, dune, alder, elm])
  })

  it('sorts by the next answer date, overdue first, with cases that have none last both ways', async () => {
    expect(await ids(by('next', 'asc'))).toEqual([dune, birch, elm, cedar, alder])
    expect(await ids(by('next', 'desc'))).toEqual([birch, dune, elm, cedar, alder])
  })

  it('sorts stayed cases first on the first click and last on the second', async () => {
    expect((await ids(by('stay', 'desc')))[0]).toBe(birch)
    expect((await ids(by('stay', 'asc'))).at(-1)).toBe(birch)
  })

  it('pages by offset', async () => {
    expect(await ids({ limit: 2, offset: 2 })).toEqual([cedar, birch])
  })
})

describe('enforcement case quick filters', () => {
  it('filters by status and ORs values inside the group', async () => {
    expect(await ids({ filters: { statuses: ['closed'] } })).toEqual([cedar])
    expect(await ids({ filters: { statuses: ['closed', 'in_court'] } })).toEqual([dune, cedar])
  })

  it('overdue lists cases with an unanswered answer date in the past', async () => {
    expect(await ids({ filters: { due: ['overdue'] } })).toEqual([dune])
  })

  it('due this week lists cases whose next answer date falls within seven days', async () => {
    expect(await ids({ filters: { due: ['week'] } })).toEqual([birch])
  })

  it('no deadline running lists cases with no upcoming answer date', async () => {
    expect(await ids({ filters: { due: ['none'] } })).toEqual([elm, cedar, alder])
  })

  it('mine lists the cases assigned to the viewer and unassigned lists the rest', async () => {
    expect(await ids({ filters: { assigned: ['me'] } })).toEqual([elm, alder])
    expect(await ids({ filters: { assigned: ['none'] } })).toEqual([dune, cedar])
  })

  it('ANDs groups together', async () => {
    expect(await ids({ filters: { assigned: ['none'], due: ['week'] } })).toEqual([])
    expect(await ids({ filters: { assigned: ['me'], due: ['none'] } })).toEqual([elm, alder])
  })

  it('counts every chip with the other groups applied', async () => {
    const all = await caseListFacets(handle.db, staff, { filters: {} }, TODAY, signal)
    expect(all.statuses.get('intake')).toBe(1)
    expect(all.statuses.get('resolved')).toBe(0)
    expect(all.due.get('overdue')).toBe(1)
    expect(all.due.get('none')).toBe(3)
    expect(all.assigned.get('me')).toBe(2)
    const narrowed = await caseListFacets(
      handle.db,
      staff,
      { filters: { assigned: ['none'] } },
      TODAY,
      signal,
    )
    expect(narrowed.due.get('none')).toBe(1)
    expect(narrowed.assigned.get('me')).toBe(2)
    expect(narrowed.statuses.get('closed')).toBe(1)
  })
})

describe('enforcement case queue rows', () => {
  it('shows the next answer date from the same expression the sort uses', async () => {
    const queue = await listCaseQueue(
      handle.db,
      staff,
      { filters: {}, ...by('next', 'asc'), limit: 25, offset: 0 },
      TODAY,
      signal,
    )
    expect(queue.rows[0]?.nextDue?.label).toBe('Answer overdue')
    expect(queue.rows[1]?.nextDue).toEqual({ date: '2027-03-05', label: 'Answer due' })
    expect(queue.rows.at(-1)?.nextDue).toBeNull()
  })

  it('shows an unanswered past answer date as overdue instead of none running', async () => {
    const queue = await listCaseQueue(
      handle.db,
      staff,
      { filters: { due: ['overdue'] }, limit: 25, offset: 0 },
      TODAY,
      signal,
    )
    const row = queue.rows.find((r) => r.caseId === dune)
    expect(row?.nextDue?.label).toBe('Answer overdue')
    expect(row?.nextDue?.date !== undefined && row.nextDue.date < TODAY).toBe(true)
  })

  it('agrees with the stay lookup on which cases are stayed', async () => {
    for (const id of [alder, birch, cedar, dune, elm]) {
      expect((await stayFor(handle.db, id, TODAY, signal)).stayed).toBe(id === birch)
    }
  })
})
