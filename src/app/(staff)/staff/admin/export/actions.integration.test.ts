import { beforeAll, expect, vi } from 'vitest'
import { exportsTable } from '@/db/schema'
import { CHECK_PASSED } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import { actionHarness, describeActionCases, STAFF_REFUSALS } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { requestExportAction } = await import('./actions')

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

describeActionCases(h, 'requestExportAction', {
  invoke: requestExportAction,
  actor: () => h.actorFor('admin'),
  input: async () => {
    await h.db.delete(exportsTable)
    return {}
  },
  fields: {},
  capability: 'export.download',
  refusals: { ...STAFF_REFUSALS, checkOnly: CHECK_PASSED },
  ignoreWrites: ['exports'],
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Export requested. It is ready in a few minutes. Reload this page to see it.',
    })
    expect(written).toEqual(expect.arrayContaining(['audit_log']))
    expect((await db.select({ id: exportsTable.id }).from(exportsTable)).length).toBe(1)
  },
})
