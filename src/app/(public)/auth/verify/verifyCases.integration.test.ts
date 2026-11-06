import { expect, vi } from 'vitest'
import { magicLinks, sessions } from '@/db/schema'
import { requestMagicLink, resetMagicLinkLimiter } from '@/features/auth/magicLink'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { actionHarness, redirectsTo, text } from '@/test/testHarness/actions'
import { describeAnonymousCases } from '@/test/testHarness/actions/anonymousCases'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { confirmMagicLinkAction } = await import('./actions')

const h = actionHarness()
const signal = new AbortController().signal
const INVALID = redirectsTo('/sign-in?error=invalid')
const EMAIL = 'pat@alderpond.example'

async function liveToken(): Promise<string> {
  resetMagicLinkLimiter()
  const outbox = createMemoryTransport()
  await requestMagicLink(h.db, outbox, EMAIL, signal)
  return /token=([A-Za-z0-9_-]+)/.exec(outbox.sent.at(-1)?.text ?? '')?.[1] ?? ''
}

describeAnonymousCases(h, 'confirmMagicLinkAction', {
  invoke: confirmMagicLinkAction,
  input: async () => ({ token: await liveToken() }),
  fields: { token: text({ required: true }) },
  refusals: { csrf: INVALID, checkOnly: INVALID, invalid: INVALID },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual(redirectsTo('/'))
    expect(written).toEqual(expect.arrayContaining(['magic_links', 'sessions', 'users']))
    const links = await db.select({ consumed: magicLinks.consumedAt }).from(magicLinks)
    expect(links.map((l) => l.consumed !== null)).toEqual([true])
    expect(await db.select({ id: sessions.id }).from(sessions)).toHaveLength(1)
  },
})
