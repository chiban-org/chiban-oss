import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'
import { devSignIn } from '@/features/auth/devSignIn'
import { loadSession } from '@/features/auth/session'
import { seedDemo } from '@/features/demo/seedDemo'
import { makeTestDb, type TestDb } from '@/test/db'
import { useDemoStoryClock } from '@/test/demoSeedDeps'
import { makeUser } from '@/test/factories'

let handle: TestDb
const signal = new AbortController().signal
const original = { nodeEnv: env.NODE_ENV, flag: env.ENABLE_DEV_SIGN_IN }

beforeAll(async () => {
  useDemoStoryClock()
  handle = await makeTestDb()
  await seedDemo(handle.db, signal)
})
afterAll(async () => {
  vi.useRealTimers()
  await handle.drop()
})
afterEach(() => {
  env.NODE_ENV = original.nodeEnv
  env.ENABLE_DEV_SIGN_IN = original.flag
})

describe('devSignIn', () => {
  it('signs in a demo user when enabled outside production', async () => {
    env.ENABLE_DEV_SIGN_IN = true
    const result = await devSignIn(handle.db, 'staff@alderpond.example', signal)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((await loadSession(handle.db, result.value.sid, signal)).ok).toBe(true)
  })

  it('is disabled in production even with the flag set', async () => {
    env.NODE_ENV = 'production'
    env.ENABLE_DEV_SIGN_IN = true
    expect(await devSignIn(handle.db, 'staff@alderpond.example', signal)).toEqual({
      ok: false,
      error: 'disabled',
    })
  })

  it('is disabled when the flag is off', async () => {
    env.ENABLE_DEV_SIGN_IN = false
    expect(await devSignIn(handle.db, 'staff@alderpond.example', signal)).toEqual({
      ok: false,
      error: 'disabled',
    })
  })

  it('refuses users outside the demo domain and unknown demo users', async () => {
    env.ENABLE_DEV_SIGN_IN = true
    await makeUser(handle.db, { email: 'real@town.example', role: 'admin' })
    expect(await devSignIn(handle.db, 'real@town.example', signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(await devSignIn(handle.db, 'ghost@alderpond.example', signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
  })
})
