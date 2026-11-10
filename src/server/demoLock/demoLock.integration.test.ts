import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'
import { DEMO_REFUSAL } from '@/features/demo/demoMode'
import { actionHarness } from '@/test/testHarness/actions'
import { lockedActionCases } from './lockedCases'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/mail/transport', () => import('@/test/testHarness/actions/mocks/mailTransport'))

const h = actionHarness()
const cases = await lockedActionCases()

afterEach(() => {
  env.CHIBAN_DEMO_MODE = false
})

describe('actions locked in demo mode', () => {
  it.each(cases)('$name is refused for an administrator and writes nothing', async (entry) => {
    env.CHIBAN_DEMO_MODE = true
    h.signIn(await h.actorFor('admin'))
    const fields = await entry.fields(h.db)
    const { value, written } = await h.recordWrites(() => entry.run(h.form(fields)))
    expect(value).toEqual(entry.refused)
    expect(written).toEqual([])
    expect(h.mail.sent).toEqual([])
  })

  it.each(cases)('$name is not refused when demo mode is off', async (entry) => {
    env.CHIBAN_DEMO_MODE = false
    h.signIn(await h.actorFor('admin'))
    const value = await entry.run(h.form(await entry.fields(h.db)))
    expect(JSON.stringify(value)).not.toContain(DEMO_REFUSAL)
  })
})
