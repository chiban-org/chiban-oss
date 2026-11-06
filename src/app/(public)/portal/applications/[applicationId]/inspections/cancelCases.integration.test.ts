import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { inspections } from '@/db/schema'
import { refuseField } from '@/server/formInput'
import {
  type InspectionWorld,
  insertInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import {
  actionHarness,
  describeActionCases,
  int,
  PORTAL_REFUSALS,
  uuid,
} from '@/test/testHarness/actions'
import { describeForeignRecordCase } from '@/test/testHarness/actions/foreignRecord'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { portalCancelInspectionAction } = await import('./actions')

const h = actionHarness()
let w: InspectionWorld

beforeAll(async () => {
  w = await setupInspectionWorld(h.db)
})

async function requestedInspection() {
  const inspectionId = await insertInspection(h.db, w.trade.applicationId, 'rough', {
    channel: 'portal',
    requestedByUserId: w.world.applicant.userId,
  })
  return { inspectionId, expectedRowVersion: '1' }
}

const NOT_FOUND = { ok: false as const, error: 'That record was not found.' }

describeActionCases(h, 'portalCancelInspectionAction', {
  invoke: portalCancelInspectionAction,
  actor: () => w.world.applicant,
  input: requestedInspection,
  fields: {
    inspectionId: uuid({ required: true }),
    expectedRowVersion: int({ required: true, min: 1 }),
  },
  capability: 'inspection.schedule',
  refusals: {
    ...PORTAL_REFUSALS,
    forbidden: NOT_FOUND,
    invalid: (v) =>
      refuseField(
        v.field,
        v.field === 'inspectionId'
          ? 'Choose an inspection.'
          : v.kind === 'fraction' || v.kind === 'words' || v.kind === 'below_min'
            ? 'Enter the version as a whole number from 1 to 2147483647.'
            : 'Enter the version.',
      ),
  },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({ ok: true, message: 'Request cancelled.' })
    const [row] = await db
      .select({ status: inspections.status, reason: inspections.cancelReason })
      .from(inspections)
      .where(eq(inspections.id, input.inspectionId))
    expect(row).toEqual({ status: 'cancelled', reason: 'requester' })
  },
})

describeForeignRecordCase(h, 'portalCancelInspectionAction on another applicant request', {
  invoke: portalCancelInspectionAction,
  actor: () => w.stranger,
  input: requestedInspection,
  refusal: NOT_FOUND,
})
