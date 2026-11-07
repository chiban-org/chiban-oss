import { and, eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { auditLog, configVersions } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import { actionHarness, describeActionCases, int, STAFF_REFUSALS } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { changeRecheckIntervalAction } = await import('./intervalActions')

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

describeActionCases(h, 'changeRecheckIntervalAction', {
  invoke: changeRecheckIntervalAction,
  actor: () => h.actorFor('admin'),
  input: () => ({ days: '45' }),
  fields: { days: int({ required: true, min: 1, max: 3650 }) },
  capability: 'config.edit',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant) =>
      refuseField(
        'days',
        variant.kind === 'missing'
          ? 'Enter the number of days.'
          : 'Enter the number of days as a whole number from 1 to 3650.',
      ),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Put version 1 into use. Contacts are now due every 45 days.',
    })
    expect(written).toEqual(['audit_log', 'config_versions'])
    const versions = await db
      .select({
        status: configVersions.status,
        version: configVersions.version,
        body: configVersions.body,
      })
      .from(configVersions)
      .where(and(eq(configVersions.kind, 'board_settings'), eq(configVersions.key, 'default')))
    expect(versions).toEqual([
      {
        status: 'published',
        version: 1,
        body: expect.objectContaining({
          abutters: expect.objectContaining({ recheckContactsDays: 45 }),
        }),
      },
    ])
    const audits = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.entityType, 'config_version'))
    expect(audits.map((a) => a.action).sort()).toEqual(['config.publish', 'config.save_draft'])
  },
})
