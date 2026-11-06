import { beforeAll, expect, vi } from 'vitest'
import { ROLES } from '@/constants/roles'
import { FULL_RECORD_ROLES } from '@/features/access/roles'
import { formatCivilDate } from '@/lib/formatDate'
import { CHECK_PASSED } from '@/server/formInput'
import { applicationIn } from '@/test/applicationCases'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { refusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  date,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import { todayInTimeZone } from '@/types/civilDate'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { markCompleteAction, recordCodeEditionAction } = await import('./actions')

const h = actionHarness()
let world: PermitWorld
const today = todayInTimeZone('America/New_York', new Date())

beforeAll(async () => {
  world = await setupPermitWorld(h.db)
})

const BUILDING = {
  receivedDate: '2026-06-01',
  facts: { classification: 'residential', dwellingUnits: 1, afterTheFact: false },
}

const NO_FULL_RECORD = ROLES.filter((r) => !(FULL_RECORD_ROLES as readonly string[]).includes(r))
const OUT_OF_RANGE = () =>
  `Enter the completed date between January 1, 1900 and ${formatCivilDate(today)}.`

describeActionCases(h, 'markCompleteAction', {
  invoke: markCompleteAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: (await applicationIn(h.db, world, 'submitted', BUILDING)).applicationId,
    completedDate: '2026-06-15',
  }),
  fields: {
    applicationId: uuid({ required: true }),
    completedDate: date({ required: true, earliest: '1900-01-01', latest: today }),
  },
  refusedRoles: NO_FULL_RECORD,
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant) =>
      refusalFor({
        applicationId: 'Choose an application.',
        completedDate: {
          missing: 'Enter the completed date.',
          impossible_date: 'Enter the completed date as a date.',
          words: 'Enter the completed date as a date.',
          otherwise: OUT_OF_RANGE(),
        },
      })(variant),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Marked complete. The decision clock is running.' })
    expect(written).toEqual(['applications', 'audit_log', 'clocks'])
  },
})

describeActionCases(h, 'recordCodeEditionAction', {
  invoke: recordCodeEditionAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({
    applicationId: (await applicationIn(h.db, world, 'under_review', BUILDING)).applicationId,
  }),
  fields: {
    applicationId: uuid({ required: true }),
    election: text({ max: 100 }),
  },
  capability: 'permit.issue',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose an application.',
      election: 'Enter a code edition of 100 characters or fewer.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Code edition recorded.' })
    expect(written).toEqual(['audit_log', 'code_edition_records'])
  },
})
