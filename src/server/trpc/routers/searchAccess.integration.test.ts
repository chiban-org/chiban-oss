import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import type { SearchResult } from '@/features/search/searchTypes'
import { makeTestCaller } from '@/server/testCaller'
import { makeTestDb, type TestDb } from '@/test/db'
import { type SearchWorld, STREET, setupSearchWorld } from '@/test/globalSearchWorld'

let handle: TestDb
let w: SearchWorld

beforeAll(async () => {
  handle = await makeTestDb()
  w = await setupSearchWorld(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

function findAs(actor: Actor, q: string): Promise<SearchResult> {
  return makeTestCaller(handle.db, actor).search.find({ q })
}

async function exactKinds(actor: Actor): Promise<string[]> {
  const numbers = [
    w.assigned.number,
    w.unassigned.number,
    w.caseNumber,
    w.orderNumber,
    w.complaintNumber,
    w.requestNumber,
    w.receiptNumber,
  ]
  const found = await Promise.all(numbers.map((n) => findAs(actor, n)))
  return found.flatMap((r) => (r.exact === null ? [] : [`${r.exact.kind}:${r.exact.number}`]))
}

async function groupKeys(actor: Actor): Promise<string[]> {
  return (await findAs(actor, STREET)).groups.map((g) => g.key)
}

describe('search.find respects each viewer access', () => {
  it('shows an admin applications, cases and receipts but not requests', async () => {
    const { admin } = w.world
    expect(await exactKinds(admin)).toEqual([
      `application:${w.assigned.number}`,
      `application:${w.unassigned.number}`,
      `case:${w.caseNumber}`,
      `order:${w.orderNumber}`,
      `complaint:${w.complaintNumber}`,
      `receipt:${w.receiptNumber}`,
    ])
    expect(await groupKeys(admin)).toEqual(['applications', 'cases', 'parcels'])
  })

  it('shows a reviewer only the application assigned to them and parcels', async () => {
    const { reviewer } = w.world
    expect(await exactKinds(reviewer)).toEqual([`application:${w.assigned.number}`])
    const result = await findAs(reviewer, STREET)
    expect(result.groups.map((g) => g.key)).toEqual(['applications', 'parcels'])
    const apps = result.groups.find((g) => g.key === 'applications')
    expect(apps?.rows.map((r) => r.title)).toEqual([w.assigned.number])
    expect((await findAs(reviewer, 'BP-2027')).groups[0]?.seeAll).toBeNull()
  })

  it('shows an inspector cases but not requests or receipts paid by others', async () => {
    expect(await exactKinds(w.inspector)).toEqual([
      `application:${w.assigned.number}`,
      `application:${w.unassigned.number}`,
      `case:${w.caseNumber}`,
      `order:${w.orderNumber}`,
      `complaint:${w.complaintNumber}`,
    ])
    expect(await groupKeys(w.inspector)).toEqual(['applications', 'cases', 'parcels'])
  })

  it('shows a records custodian requests and receipts but not cases', async () => {
    expect(await exactKinds(w.custodian)).toEqual([
      `application:${w.assigned.number}`,
      `application:${w.unassigned.number}`,
      `request:${w.requestNumber}`,
      `receipt:${w.receiptNumber}`,
    ])
    expect(await groupKeys(w.custodian)).toEqual(['applications', 'parcels', 'requests'])
  })

  it('shows a board member with no hearing only parcels', async () => {
    expect(await exactKinds(w.boardMember)).toEqual([])
    expect(await groupKeys(w.boardMember)).toEqual(['parcels'])
  })
})
