import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'
import { SESSION_COOKIE } from '@/constants/cookies'
import { createSession, loadSession } from '@/features/auth/session'
import { resetDemoSignInLimiter } from '@/features/demo/demoSignInLimit'
import { makeUser } from '@/test/factories'
import { actionHarness, redirectsTo, settle } from '@/test/testHarness/actions'
import { harnessState } from '@/test/testHarness/actions/state'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { demoSignInAction } = await import('./actions')
const { devSignInAction } = await import('../dev/sign-in/actions')

const h = actionHarness()
const signal = new AbortController().signal
const original = { nodeEnv: env.NODE_ENV, dev: env.ENABLE_DEV_SIGN_IN }
const sid = () => harnessState.cookies.get(SESSION_COOKIE)
const ids = new Map<string, string>()

beforeAll(async () => {
  const people = [
    { email: 'admin@alderpond.example', role: 'admin' as const },
    { email: 'staff@alderpond.example', role: 'staff' as const },
    { email: 'finance@alderpond.example', role: 'finance' as const },
    { email: 'clerk@real-town.example', role: 'admin' as const },
    {
      email: 'pb.member@alderpond.example',
      role: 'board_member' as const,
      kind: 'public' as const,
    },
  ]
  for (const person of people) ids.set(person.email, await makeUser(h.db, person))
})

beforeEach(() => {
  env.NODE_ENV = 'production'
  env.ENABLE_DEV_SIGN_IN = false
  env.CHIBAN_DEMO_MODE = true
  resetDemoSignInLimiter()
})
afterEach(() => {
  env.NODE_ENV = original.nodeEnv
  env.ENABLE_DEV_SIGN_IN = original.dev
  env.CHIBAN_DEMO_MODE = false
})

describe('demo sign-in', () => {
  it('signs a visitor in as the chosen persona and lands on its home page', async () => {
    const outcome = await settle(demoSignInAction(h.form({ email: 'pb.member@alderpond.example' })))
    expect(outcome).toEqual(redirectsTo('/board'))
    const token = sid()
    if (token === undefined) throw new Error('no session cookie')
    expect((await loadSession(h.db, token, signal)).ok).toBe(true)
  })

  it('switching persona ends only the earlier session of this visitor', async () => {
    const other = await createSession(h.db, ids.get('admin@alderpond.example') ?? '', signal)
    if (!other.ok) throw new Error('setup')
    await settle(demoSignInAction(h.form({ email: 'admin@alderpond.example' })))
    const first = sid()
    expect(await settle(demoSignInAction(h.form({ email: 'staff@alderpond.example' })))).toEqual(
      redirectsTo('/staff'),
    )
    if (first === undefined) throw new Error('setup')
    expect((await loadSession(h.db, first, signal)).ok).toBe(false)
    expect((await loadSession(h.db, other.value.sid, signal)).ok).toBe(true)
  })

  it('refuses anyone who is not a listed persona, even at the demo domain', async () => {
    for (const email of ['official@alderpond.example', 'clerk@real-town.example']) {
      expect(await settle(demoSignInAction(h.form({ email })))).toEqual(redirectsTo('/demo'))
    }
    expect(sid()).toBeUndefined()
  })

  it('does nothing when demo mode is off', async () => {
    env.CHIBAN_DEMO_MODE = false
    expect(await settle(demoSignInAction(h.form({ email: 'admin@alderpond.example' })))).toEqual(
      redirectsTo('/'),
    )
    expect(sid()).toBeUndefined()
  })

  it('refuses a request without the CSRF token', async () => {
    const form = h.form({ email: 'admin@alderpond.example' }, null)
    expect(await settle(demoSignInAction(form))).toEqual(redirectsTo('/demo'))
    expect(sid()).toBeUndefined()
  })

  it('slows down one address that signs in too often', async () => {
    h.setHeader('x-forwarded-for', '198.51.100.7')
    for (let i = 0; i < 30; i += 1) {
      await settle(demoSignInAction(h.form({ email: 'admin@alderpond.example' })))
    }
    expect(await settle(demoSignInAction(h.form({ email: 'admin@alderpond.example' })))).toEqual(
      redirectsTo('/demo?busy=1'),
    )
    h.setHeader('x-forwarded-for', '198.51.100.8')
    expect(await settle(demoSignInAction(h.form({ email: 'admin@alderpond.example' })))).toEqual(
      redirectsTo('/staff'),
    )
  })

  it('keeps the dev sign-in action closed in a production demo', async () => {
    const outcome = await settle(
      devSignInAction(h.form({ email: 'admin@alderpond.example', kind: 'staff' })),
    )
    expect(outcome).toEqual(redirectsTo('/dev/sign-in'))
    expect(sid()).toBeUndefined()
  })
})
