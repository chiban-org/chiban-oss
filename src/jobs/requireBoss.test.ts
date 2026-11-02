import type { PgBoss } from 'pg-boss'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { clearBoss, getBoss, setBoss } from '@/jobs/boss'
import { requireBoss } from '@/jobs/requireBoss'

const original = env.NODE_ENV
const fake = { send: () => undefined } as unknown as PgBoss

beforeEach(() => {
  clearBoss()
})
afterEach(() => {
  env.NODE_ENV = original
  clearBoss()
})

describe('requireBoss', () => {
  it('throws a typed error in production mode when no boss is set', () => {
    env.NODE_ENV = 'production'
    try {
      requireBoss()
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(AppError)
      expect((e as AppError).id).toBe(ErrorIds.JOB_BOSS_MISSING)
    }
  })

  it('returns the boss that was set', () => {
    setBoss(fake)
    expect(requireBoss()).toBe(fake)
  })

  it('shares the handle across duplicated module copies', async () => {
    setBoss(fake)
    vi.resetModules()
    const copy = await import('@/jobs/boss')
    expect(copy.getBoss()).toBe(fake)
    expect(getBoss()).toBe(fake)
  })
})
