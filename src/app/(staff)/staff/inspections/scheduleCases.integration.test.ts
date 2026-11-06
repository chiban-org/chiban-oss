import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import {
  checklistIdFor,
  type InspectionWorld,
  insertInspection,
  newIssuedPermit,
  scheduledInspection,
  setupInspectionWorld,
} from '@/test/inspectionFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  choice,
  date,
  describeActionCases,
  int,
  isPublicRole,
  phone,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/town/today', async (original) => ({
  ...(await original<typeof import('@/features/town/today')>()),
  townToday: () => Promise.resolve('2027-07-01'),
}))

const { scheduleInspectionAction, cancelInspectionAction } = await import('./actions')

const h = actionHarness()
let w: InspectionWorld

beforeAll(async () => {
  w = await setupInspectionWorld(h.db)
})

const DATE_RANGE = 'between January 1, 1900 and December 31, 2099.'
const VERSION = {
  missing: 'Enter the version of the inspection.',
  otherwise: 'Enter the version of the inspection as a whole number from 1 to 2147483647.',
}

describeActionCases(h, 'scheduleInspectionAction', {
  invoke: scheduleInspectionAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    inspectionId: await insertInspection(h.db, w.trade.applicationId, 'rough'),
    inspectorUserId: w.inspector.userId,
    date: '2027-07-12',
    startMinute: '630',
    expectedRowVersion: '1',
  }),
  fields: {
    inspectionId: uuid({ required: true }),
    inspectorUserId: uuid({ required: true }),
    date: date({ required: true, earliest: '1900-01-01', latest: '2099-12-31' }),
    startMinute: int({ required: true, min: 0, max: 1439 }),
    expectedRowVersion: int({ required: true, min: 1, max: 2_147_483_647 }),
    offGridReason: text({ max: 500 }),
  },
  capability: 'inspection.schedule',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      inspectionId: 'Choose an inspection.',
      inspectorUserId: 'Choose an inspector.',
      date: {
        missing: 'Enter the date.',
        impossible_date: 'Enter the date as a date.',
        words: 'Enter the date as a date.',
        otherwise: `Enter the date ${DATE_RANGE}`,
      },
      startMinute: {
        missing: 'Enter the start time.',
        otherwise: 'Enter the start time as a whole number from 0 to 1439.',
      },
      expectedRowVersion: VERSION,
      offGridReason: 'Enter the reason of 500 characters or fewer.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Scheduled. The inspector gets a calendar invite.',
    })
    expect(written).toEqual(['audit_log', 'calendar_pushes', 'inspections', 'notification_outbox'])
  },
})

describeActionCases(h, 'cancelInspectionAction', {
  invoke: cancelInspectionAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    inspectionId: await scheduledInspection(h.db, w.inspector, w.trade.applicationId, 'rough'),
    expectedRowVersion: '1',
  }),
  fields: {
    inspectionId: uuid({ required: true }),
    expectedRowVersion: int({ required: true, min: 1, max: 2_147_483_647 }),
  },
  capability: 'inspection.schedule',
  refusals: {
    ...STAFF_REFUSALS,
    forbidden: (role) =>
      isPublicRole(role)
        ? { ok: false as const, error: 'Sign in to continue.' }
        : { ok: false as const, error: 'That record was not found.' },
    invalid: refusalFor({ inspectionId: 'Choose an inspection.', expectedRowVersion: VERSION }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Cancelled.' })
    expect(written).toEqual(['audit_log', 'calendar_pushes', 'inspections', 'notification_outbox'])
  },
})
