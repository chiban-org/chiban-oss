import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { devSignIn, isDemoSignInEnabled, isDevSignInEnabled } from '@/features/auth/devSignIn'
import { loadSession } from '@/features/auth/session'
import { seedDemo } from '@/features/demo/seedDemo'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'

let handle: TestDb
const signal = new AbortController().signal
const original = {
  nodeEnv: env.NODE_ENV,
  flag: env.ENABLE_DEV_SIGN_IN,
  demo: env.CHIBAN_DEMO_MODE,
}

beforeAll(async () => {
  handle = await makeTestDb()
  await seedDemo(handle.db, signal)
})
afterAll(async () => {
  await handle.drop()
})
afterEach(() => {
  env.NODE_ENV = original.nodeEnv
  env.ENABLE_DEV_SIGN_IN = original.flag
  env.CHIBAN_DEMO_MODE = original.demo
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

  it('signs in a demo user in a production build when demo mode is on', async () => {
    env.NODE_ENV = 'production'
    env.ENABLE_DEV_SIGN_IN = false
    env.CHIBAN_DEMO_MODE = true
    const result = await devSignIn(handle.db, 'admin@alderpond.example', signal)
    expect(result.ok).toBe(true)
  })

  it('keeps refusing real accounts in demo mode', async () => {
    env.NODE_ENV = 'production'
    env.CHIBAN_DEMO_MODE = true
    await makeUser(handle.db, { email: 'clerk@real-town.example', role: 'admin' })
    expect(await devSignIn(handle.db, 'clerk@real-town.example', signal)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(
      await devSignIn(handle.db, 'clerk@real-town.example.alderpond.example.org', signal),
    ).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('stays off in production when demo mode is off', () => {
    env.NODE_ENV = 'production'
    env.ENABLE_DEV_SIGN_IN = true
    env.CHIBAN_DEMO_MODE = false
    expect(isDemoSignInEnabled()).toBe(false)
    expect(isDevSignInEnabled()).toBe(false)
  })

  it('opens only the demo path, not the dev page, in demo mode', () => {
    env.NODE_ENV = 'production'
    env.CHIBAN_DEMO_MODE = true
    expect(isDemoSignInEnabled()).toBe(true)
    expect(isDevSignInEnabled()).toBe(false)
  })
})
