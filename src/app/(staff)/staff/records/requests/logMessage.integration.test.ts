import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { seedParcelWorld } from '@/test/parcels'
import { RTK_TODAY } from '@/test/rtkFixtures'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: RTK_TODAY })
  await seedParcelWorld(h.db)
})
afterAll(() => {
  vi.useRealTimers()
})

describe('the message after logging a request', () => {
  it('names the new request number', async () => {
    h.signIn(await h.actorFor('records_custodian'))
    const log = async () =>
      await actions.logRequestAction(
        h.form({
          receivedOn: '2026-11-04',
          receivedVia: 'mail',
          requesterName: 'Priya Holloway',
          description: 'Septic plans for 14 Vellmora Lane',
        }),
      )
    expect(await log()).toEqual({ ok: true, message: 'Request RK-2026-0001 logged.' })
    expect(await log()).toEqual({ ok: true, message: 'Request RK-2026-0002 logged.' })
  })
})
