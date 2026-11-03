import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { rtkRequests } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { listRtkRequestPage, rtkRequestFacets } from '@/features/rtk/requestList'
import type { RequestListFilters, RequestSortKey } from '@/features/rtk/requestListParams'
import { logRequest } from '@/features/rtk/requests'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
const TODAY = '2027-07-14' as CivilDate
let handle: TestDb
let staff: Actor
let reviewer: Actor
let oldest = ''
let middle = ''
let recent = ''
let responded = ''
let closed = ''

async function log(receivedOn: string, description: string): Promise<string> {
  const result = await logRequest(
    handle.db,
    staff,
    {
      receivedOn: receivedOn,
      receivedVia: 'email',
      requesterName: 'Jordan Reyes',
      description,
    },
    signal,
    NOW,
  )
  if (!result.ok) throw new Error('log failed')
  return result.value.requestId
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  reviewer = await staffActor(handle.db, 'reviewer')
  oldest = await log('2027-06-20', 'Zoning minutes')
  middle = await log('2027-07-02', 'Birch Lane permits')
  recent = await log('2027-07-12', 'Culvert survey')
  responded = await log('2027-07-06', 'Assessor cards')
  closed = await log('2027-07-01', 'Old petition')
  await handle.db
    .update(rtkRequests)
    .set({ status: 'responded' })
    .where(eq(rtkRequests.id, responded))
  await handle.db
    .update(rtkRequests)
    .set({ status: 'closed', openDueOn: null })
    .where(eq(rtkRequests.id, closed))
})
afterAll(async () => {
  await handle.drop()
})

async function page(
  options: {
    filters?: RequestListFilters
    sort?: { key: RequestSortKey; dir: 'asc' | 'desc' }
    limit?: number
    offset?: number
    actor?: Actor
  } = {},
) {
  return await listRtkRequestPage(
    handle.db,
    options.actor ?? staff,
    {
      filters: options.filters ?? {},
      ...(options.sort === undefined ? {} : { sort: options.sort }),
      limit: options.limit ?? 25,
      offset: options.offset ?? 0,
      today: TODAY,
    },
    signal,
  )
}
const ids = async (options: Parameters<typeof page>[0]) =>
  (await page(options)).rows.map((r) => r.id)
const by = (key: RequestSortKey, dir: 'asc' | 'desc') => ({ sort: { key, dir } })

describe('right-to-know list sorting', () => {
  it('opens with the soonest due date first and requests with no due date last', async () => {
    expect(await ids({})).toEqual([oldest, middle, responded, recent, closed])
  })

  it('sorts by request number and by what was asked for', async () => {
    const numbers = (await page(by('number', 'asc'))).rows.map((r) => r.number)
    expect(numbers).toEqual([...numbers].sort())
    expect(await ids(by('asked', 'asc'))).toEqual([responded, middle, recent, closed, oldest])
  })

  it('sorts by received date newest first and flips on the second click', async () => {
    expect(await ids(by('received', 'desc'))).toEqual([recent, responded, middle, closed, oldest])
    expect(await ids(by('received', 'asc'))).toEqual([oldest, closed, middle, responded, recent])
  })

  it('sorts by status in workflow order with the received date as the tiebreak', async () => {
    expect(await ids(by('status', 'asc'))).toEqual([oldest, middle, recent, responded, closed])
  })

  it('pages by offset under a chosen sort', async () => {
    const first = await page({ ...by('received', 'desc'), limit: 2 })
    expect(first.rows.map((r) => r.id)).toEqual([recent, responded])
    expect(first.total).toBe(5)
    expect(first.nextOffset).toBe(2)
    const last = await page({ ...by('received', 'desc'), limit: 2, offset: 4 })
    expect(last.rows.map((r) => r.id)).toEqual([oldest])
    expect(last.nextOffset).toBeNull()
    expect(last.prevOffset).toBe(2)
  })

  it('shows nothing to a viewer without records access', async () => {
    const hidden = await page({ actor: reviewer })
    expect(hidden.rows).toEqual([])
    expect(hidden.total).toBe(0)
  })
})

describe('right-to-know quick filters', () => {
  it('filters by status and ORs values inside the group', async () => {
    expect(await ids({ filters: { statuses: ['closed'] } })).toEqual([closed])
    expect(
      await ids({ filters: { statuses: ['closed', 'responded'] }, ...by('received', 'asc') }),
    ).toEqual([closed, responded])
  })

  it('overdue lists open requests past their due date and skips responded ones', async () => {
    expect(await ids({ filters: { due: ['overdue'] } })).toEqual([oldest, middle])
  })

  it('due this week lists requests due from today through seven days out', async () => {
    expect(await ids({ filters: { due: ['week'] } })).toEqual([recent])
  })

  it('no deadline running lists requests without a due date', async () => {
    expect(await ids({ filters: { due: ['none'] } })).toEqual([closed])
  })

  it('ANDs groups together', async () => {
    expect(await ids({ filters: { statuses: ['closed'], due: ['overdue'] } })).toEqual([])
  })

  it('counts every chip with the other groups applied', async () => {
    const counts = await rtkRequestFacets(handle.db, staff, { filters: {}, today: TODAY }, signal)
    expect(counts.statuses.get('open')).toBe(3)
    expect(counts.statuses.get('responded')).toBe(1)
    expect(counts.statuses.get('withdrawn')).toBe(0)
    expect(counts.due.get('overdue')).toBe(2)
    expect(counts.due.get('week')).toBe(1)
    expect(counts.due.get('none')).toBe(1)
    const narrowed = await rtkRequestFacets(
      handle.db,
      staff,
      { filters: { statuses: ['closed'] }, today: TODAY },
      signal,
    )
    expect(narrowed.due.get('none')).toBe(1)
    expect(narrowed.due.get('overdue')).toBe(0)
    expect(narrowed.statuses.get('open')).toBe(3)
  })
})
