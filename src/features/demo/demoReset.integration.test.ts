import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { users } from '@/db/schema'
import { demoResetAllowed, resetDemoDatabase } from '@/features/demo/demoReset'
import { makeTestDb, type TestDb } from '@/test/db'
import { demoSeedDeps } from '@/test/demoSeedDeps'
import { makeUser } from '@/test/factories'

let handle: TestDb
const signal = new AbortController().signal
const original = { nodeEnv: env.NODE_ENV, dev: env.ENABLE_DEV_SIGN_IN }

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})
afterEach(() => {
  env.NODE_ENV = original.nodeEnv
  env.ENABLE_DEV_SIGN_IN = original.dev
  env.CHIBAN_DEMO_MODE = false
})

describe('demo reset', () => {
  it('runs only on a dev database with dev sign-in or on a demo', () => {
    env.NODE_ENV = 'production'
    env.ENABLE_DEV_SIGN_IN = true
    expect(demoResetAllowed()).toBe(false)
    env.CHIBAN_DEMO_MODE = true
    expect(demoResetAllowed()).toBe(true)
    env.NODE_ENV = 'development'
    env.CHIBAN_DEMO_MODE = false
    expect(demoResetAllowed()).toBe(true)
    env.ENABLE_DEV_SIGN_IN = false
    expect(demoResetAllowed()).toBe(false)
  })

  it('refuses to touch the database when it is not allowed', async () => {
    env.NODE_ENV = 'production'
    await makeUser(handle.db, { email: 'kept@alderpond.example' })
    const result = await resetDemoDatabase(handle.db, signal, await demoSeedDeps())
    expect(result).toEqual({ ok: false, error: 'not_allowed' })
    const kept = await handle.db
      .select()
      .from(users)
      .where(eq(users.email, 'kept@alderpond.example'))
    expect(kept).toHaveLength(1)
  })

  it('empties the database, migrates it and seeds the demo again', async () => {
    env.NODE_ENV = 'production'
    env.CHIBAN_DEMO_MODE = true
    await makeUser(handle.db, { email: 'visitor.made@alderpond.example' })
    const result = await resetDemoDatabase(handle.db, signal, await demoSeedDeps())
    expect(result.ok).toBe(true)
    const emails = (await handle.db.select({ email: users.email }).from(users)).map((u) => u.email)
    expect(emails).toContain('admin@alderpond.example')
    expect(emails).not.toContain('visitor.made@alderpond.example')
    expect(emails).not.toContain('kept@alderpond.example')
  })
})
