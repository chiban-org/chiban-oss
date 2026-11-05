import { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GROUP_LIMIT, type SearchResult } from '@/features/search/searchTypes'
import { makeTestCaller } from '@/server/testCaller'
import { makeTestDb, type TestDb } from '@/test/db'
import { OWNER, type SearchWorld, STREET, setupSearchWorld } from '@/test/globalSearchWorld'

let handle: TestDb
let w: SearchWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupSearchWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

function find(q: string): Promise<SearchResult> {
  return makeTestCaller(handle.db, w.world.staff).search.find({ q })
}

function group(result: SearchResult, key: string) {
  return result.groups.find((g) => g.key === key)
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (e) {
    if (e instanceof TRPCError) return e.code
    throw e
  }
  return 'OK'
}

describe('search.find exact numbers', () => {
  it('jumps to an application or permit by its number', async () => {
    expect((await find(w.assigned.number)).exact).toEqual({
      kind: 'application',
      number: w.assigned.number,
      href: `/staff/applications/${w.assigned.applicationId}`,
      newTab: false,
    })
  })

  it('ignores case and surrounding spaces in a typed number', async () => {
    expect((await find(`  ${w.assigned.number.toLowerCase()} `)).exact?.href).toBe(
      `/staff/applications/${w.assigned.applicationId}`,
    )
  })

  it('jumps to an enforcement case by its EC number', async () => {
    expect((await find(w.caseNumber)).exact).toMatchObject({
      kind: 'case',
      href: `/staff/enforcement/${w.caseId}`,
    })
  })

  it('jumps to the case that holds a cease and desist order', async () => {
    expect((await find(w.orderNumber)).exact).toMatchObject({
      kind: 'order',
      href: `/staff/enforcement/${w.caseId}`,
    })
  })

  it('jumps to the case that holds a complaint', async () => {
    expect((await find(w.complaintNumber)).exact).toMatchObject({
      kind: 'complaint',
      href: `/staff/enforcement/${w.caseId}`,
    })
  })

  it('jumps to a Right-to-Know request by its number', async () => {
    expect((await find(w.requestNumber)).exact).toMatchObject({
      kind: 'request',
      href: `/staff/records/requests/${w.requestId}`,
    })
  })

  it('opens a receipt by its number in a new tab', async () => {
    expect((await find(w.receiptNumber)).exact).toEqual({
      kind: 'receipt',
      number: w.receiptNumber,
      href: `/staff/receipts/${w.receiptId}`,
      newTab: true,
    })
  })

  it('does not jump on part of a number', async () => {
    expect((await find(w.assigned.number.slice(0, -1))).exact).toBeNull()
  })
})

describe('search.find grouped matches', () => {
  it('lists an application with its number, type, address and status', async () => {
    const apps = group(await find(w.assigned.number), 'applications')
    expect(apps?.rows[0]).toEqual({
      key: w.assigned.applicationId,
      href: `/staff/applications/${w.assigned.applicationId}`,
      title: w.assigned.number,
      detail: `Building permit, 12 ${STREET}`,
      chip: { status: 'passed', label: 'Issued' },
      newTab: false,
    })
  })

  it('lists cases, parcels and requests that match', async () => {
    const result = await find(STREET)
    expect(group(result, 'cases')?.rows[0]?.detail).toContain(STREET)
    expect(group(result, 'parcels')?.rows[0]).toMatchObject({
      href: `/staff/parcels/${w.world.parcelId}`,
      title: '007001000000',
      detail: `12 ${STREET}, ${OWNER}`,
    })
    expect(group(result, 'requests')?.rows[0]).toMatchObject({
      href: `/staff/records/requests/${w.requestId}`,
      title: w.requestNumber,
    })
  })

  it('finds a parcel and its applications by owner name', async () => {
    const result = await find('Quillfeather')
    expect(group(result, 'parcels')?.rows.map((r) => r.key)).toEqual([w.world.parcelId])
    expect(group(result, 'applications')?.rows.length).toBeGreaterThan(0)
  })

  it('caps every group at the result limit', async () => {
    const result = await find(STREET)
    expect(group(result, 'applications')?.rows).toHaveLength(GROUP_LIMIT)
    expect(group(result, 'cases')?.rows).toHaveLength(GROUP_LIMIT)
  })

  it('offers every application match on the Applications list for a number search', async () => {
    const apps = group(await find('BP-2027'), 'applications')
    expect(apps?.seeAll).toEqual({
      href: '/staff/applications?q=BP-2027&stage=all',
      label: 'See all application matches',
    })
  })

  it('does not offer the Applications list when no number matched', async () => {
    expect(group(await find(STREET), 'applications')?.seeAll).toBeNull()
  })

  it('returns nothing for a one character query', async () => {
    expect(await find('B')).toEqual({ query: 'B', exact: null, groups: [] })
  })

  it('leaves out groups with no matches', async () => {
    expect((await find('zzzz-no-such-thing')).groups).toEqual([])
  })
})

describe('search.find callers', () => {
  it('refuses a caller who is not signed in', async () => {
    expect(await codeOf(makeTestCaller(handle.db, null).search.find({ q: STREET }))).toBe(
      'UNAUTHORIZED',
    )
  })

  it('refuses a signed-in applicant', async () => {
    expect(
      await codeOf(makeTestCaller(handle.db, w.world.applicant).search.find({ q: STREET })),
    ).toBe('FORBIDDEN')
  })
})
