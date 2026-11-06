import { randomUUID } from 'node:crypto'
import { beforeAll, expect, vi } from 'vitest'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { seedParcelWorld } from '@/test/parcels'
import {
  actionHarness,
  describeActionCases,
  STAFF_REFUSALS,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { publishMigrationBatchAction } = await import('./actions')

const h = actionHarness()
beforeAll(async () => {
  await seedParcelWorld(h.db)
})

describeActionCases(h, 'publishMigrationBatchAction', {
  invoke: publishMigrationBatchAction,
  actor: () => h.actorFor('staff'),
  input: () => ({ batchId: randomUUID() }),
  fields: { batchId: uuid({ required: true }) },
  capability: 'document.publish',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refuseField('batchId', 'Choose a batch.'),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: false, error: 'That record was not found.' })
    expect(written).toEqual([])
  },
})
