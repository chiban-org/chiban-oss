import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { listRtkRequestPage } from '@/features/rtk/requestList'
import { readRequestsView } from '@/features/rtk/requestListParams'
import { logRequest } from '@/features/rtk/requests'
import { makeTestDb, type TestDb } from '@/test/db'
import { homeContextFor, homeSectionsFor, rowCount, rowHref, searchOf } from '@/test/homeFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-07-14T15:00:00Z')
const OVERDUE = 'Right-to-Know requests past their response day'
const WEEK = 'Right-to-Know requests due this week'
let handle: TestDb
let staff: Actor

async function log(receivedOn: string) {
  const result = await logRequest(
    handle.db,
    staff,
    { receivedOn, receivedVia: 'email', requesterName: 'Jordan Reyes', description: 'Minutes' },
    signal,
    NOW,
  )
  if (!result.ok) throw new Error('log failed')
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  await log('2027-06-20')
  await log('2027-07-01')
  await log('2027-07-12')
})
afterAll(async () => {
  await handle.drop()
})

describe('the Right-to-Know rows on a clerk Today', () => {
  it('shows a clerk who handles requests the overdue and due-this-week counts of the log', async () => {
    const ctx = await homeContextFor(handle.db, staff, NOW)
    const sections = await homeSectionsFor(handle.db, staff, NOW)
    const section = sections.find((s) => s.key === 'records')
    for (const label of [OVERDUE, WEEK]) {
      const { filters } = readRequestsView(searchOf(rowHref(section, label)))
      const page = await listRtkRequestPage(
        handle.db,
        staff,
        { filters, limit: 25, offset: 0, today: ctx.today },
        signal,
      )
      expect(page.total).toBe(rowCount(section, label))
    }
    expect(rowCount(section, OVERDUE) + rowCount(section, WEEK)).toBeGreaterThan(0)
  })
})
