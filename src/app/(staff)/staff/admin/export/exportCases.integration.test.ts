import { expect, vi } from 'vitest'
import { CHECK_PASSED } from '@/server/formInput'
import { actionHarness, describeActionCases, STAFF_REFUSALS } from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()

describeActionCases(h, 'requestExportAction', {
  invoke: actions.requestExportAction,
  actor: () => h.actorFor('admin'),
  input: () => ({}),
  fields: {},
  capability: 'export.download',
  refusals: { ...STAFF_REFUSALS, checkOnly: CHECK_PASSED },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Export requested. It is ready in a few minutes. Reload this page to see it.',
    })
    expect(written).toEqual(['audit_log', 'exports'])
  },
})
