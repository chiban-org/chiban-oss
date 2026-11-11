import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { logRequest } from '@/features/rtk/requests'
import { seedParcelWorld } from '@/test/parcels'
import { RTK_RECEIVED_ON, RTK_TODAY } from '@/test/rtkFixtures'
import { actionHarness } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)

const actions = await import('./actions')

const h = actionHarness()
h.useObjectStore()
const signal = new AbortController().signal

beforeAll(async () => {
  await seedParcelWorld(h.db)
  vi.useFakeTimers({ toFake: ['Date'], now: RTK_TODAY })
})
afterAll(() => {
  vi.useRealTimers()
})

describe('firstResponseAction letter delivery', () => {
  it('asks staff to print the letter when the request has no email address', async () => {
    const custodian = await h.actorFor('records_custodian')
    const logged = await logRequest(
      h.db,
      custodian,
      {
        receivedOn: RTK_RECEIVED_ON,
        receivedVia: 'mail',
        requesterContact: '12 Birch Lane, Alder Pond',
        description: 'The Birch Lane owner letters',
      },
      signal,
      RTK_TODAY,
    )
    if (!logged.ok) throw new Error(logged.error)
    h.signIn(custodian)
    const sentBefore = h.mail.sent.length
    const result = await actions.firstResponseAction(
      h.form({
        requestId: logged.value.requestId,
        kind: 'website_reference',
        respondedOn: '2026-11-04',
        websiteUrl: 'https://alderpond.example/records',
      }),
    )
    expect(result).toEqual({
      ok: true,
      message:
        'Response recorded and the letter filed. Print it from Letters and send it to the requester.',
    })
    expect(h.mail.sent).toHaveLength(sentBefore)
  })
})
