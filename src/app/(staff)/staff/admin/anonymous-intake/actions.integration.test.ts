import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { townSettings } from '@/db/schema'
import { recordVerification, runningBuild } from '@/features/anonymousIntake/staffControl'
import { CHECK_PASSED } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import { actionHarness, describeActionCases, STAFF_REFUSALS } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { enableAnonymousIntakeAction, disableAnonymousIntakeAction } = await import('./actions')

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

async function intakeEnabled(): Promise<boolean | undefined> {
  const [row] = await h.db
    .select({ on: townSettings.anonymousIntakeEnabled })
    .from(townSettings)
    .where(eq(townSettings.id, 1))
  return row?.on
}

async function setIntake(on: boolean) {
  await h.db.update(townSettings).set({ anonymousIntakeEnabled: on }).where(eq(townSettings.id, 1))
}

async function verifyRunningBuild(passed = true) {
  await recordVerification(h.db, {
    ...runningBuild(),
    caddyfileSha256: 'a'.repeat(64),
    passed,
    findings: [],
  })
}

describeActionCases(h, 'enableAnonymousIntakeAction', {
  invoke: enableAnonymousIntakeAction,
  actor: () => h.actorFor('admin'),
  input: async () => {
    await setIntake(false)
    await verifyRunningBuild()
    return {}
  },
  fields: {},
  capability: 'anonymous_intake.enable',
  refusals: { ...STAFF_REFUSALS, checkOnly: CHECK_PASSED },
  ignoreWrites: ['anonymous_intake_verifications'],
  accepted: async (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Anonymous intake is on.' })
    expect(written).toContain('town_settings')
    expect(await intakeEnabled()).toBe(true)
  },
})

describe('enableAnonymousIntakeAction without a passing retention check', () => {
  it('refuses in words and leaves intake off', async () => {
    await h.db
      .update(townSettings)
      .set({ anonymousIntakeEnabled: false })
      .where(eq(townSettings.id, 1))
    await h.db.execute(`delete from anonymous_intake_verifications` as never)
    h.signIn(await h.actorFor('admin'))
    const result = await enableAnonymousIntakeAction(h.form({}))
    expect(result).toEqual({
      ok: false,
      error: 'Anonymous intake needs a passing retention check for the version that is running.',
    })
    expect(await intakeEnabled()).toBe(false)
  })
})

describeActionCases(h, 'disableAnonymousIntakeAction', {
  invoke: disableAnonymousIntakeAction,
  actor: () => h.actorFor('admin'),
  input: async () => {
    await setIntake(true)
    return {}
  },
  fields: {},
  capability: 'anonymous_intake.enable',
  refusals: { ...STAFF_REFUSALS, checkOnly: CHECK_PASSED },
  accepted: async (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Anonymous intake is off.' })
    expect(written).toContain('town_settings')
    expect(await intakeEnabled()).toBe(false)
  },
})
