import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { enforcementCases, legalHolds, rtkRequests } from '@/db/schema'
import { recordComplaint } from '@/features/enforcement/complaints'
import { refuseField } from '@/server/formInput'
import { setupPermitWorld } from '@/test/applicationFixtures'
import { RECORDS_NOW } from '@/test/recordsClock'
import { loggedRequest } from '@/test/rtkFixtures'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
const REASON = 'Litigation pending on the site'

beforeAll(async () => {
  await setupPermitWorld(h.db)
  vi.useFakeTimers({ toFake: ['Date'], now: RECORDS_NOW })
})
afterAll(() => {
  vi.useRealTimers()
})

async function place(targetKind: string, targetRef: string) {
  h.signIn(await h.actorFor('records_custodian'))
  return await actions.placeHoldAction(h.form({ targetKind, targetRef, reason: REASON }))
}

async function holdOn(targetId: string) {
  const rows = await h.db.select().from(legalHolds).where(eq(legalHolds.targetId, targetId))
  return rows.map((r) => r.targetKind)
}

describe('placing a hold on a Right-to-Know request or a case', () => {
  it('holds a Right-to-Know request named by its number', async () => {
    const requestId = await loggedRequest(h.db, await h.actorFor('records_custodian'))
    const [row] = await h.db
      .select({ number: rtkRequests.number })
      .from(rtkRequests)
      .where(eq(rtkRequests.id, requestId))
    expect(await place('rtk_request', row?.number ?? '')).toEqual({
      ok: true,
      message: 'Legal hold placed.',
    })
    expect(await holdOn(requestId)).toEqual(['rtk_request'])
  })

  it('holds an enforcement case named by its number', async () => {
    const complaint = await recordComplaint(
      h.db,
      null,
      { channel: 'public_named', locationText: '12 Birch Lane', description: 'A shed' },
      signal,
      RECORDS_NOW,
    )
    if (!complaint.ok) throw new Error('complaint')
    const [row] = await h.db
      .select({ number: enforcementCases.number })
      .from(enforcementCases)
      .where(eq(enforcementCases.id, complaint.value.caseId))
    expect(await place('enforcement_case', row?.number ?? '')).toMatchObject({ ok: true })
    expect(await holdOn(complaint.value.caseId)).toEqual(['enforcement_case'])
  })

  it('names every kind of reference when none is given', async () => {
    expect(await place('rtk_request', '')).toEqual(
      refuseField(
        'targetRef',
        'Enter the application number, case number, request number, project title, or document title.',
      ),
    )
  })
})
