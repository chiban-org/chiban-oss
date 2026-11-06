import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { applications, inspections } from '@/db/schema'
import { recordInspectionResult } from '@/features/inspections/recordResult'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import {
  type InspectionWorld,
  newIssuedPermit,
  passingItems,
  RESULT_NOW,
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
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock(
  '@/features/storage/objectStore',
  () => import('@/test/testHarness/actions/mocks/objectStore'),
)
vi.mock('@/features/town/today', async (original) => ({
  ...(await original<typeof import('@/features/town/today')>()),
  townToday: () => Promise.resolve('2027-07-07'),
}))

const { recordResultAction } = await import('./[inspectionId]/actions')
const { issueCertificateAction } = await import('./actions')

const h = actionHarness()
h.useObjectStore()
let w: InspectionWorld
const signal = new AbortController().signal

beforeAll(async () => {
  w = await setupInspectionWorld(h.db)
})

const VERSION = {
  missing: 'Enter the version of the inspection.',
  otherwise: 'Enter the version of the inspection as a whole number from 1 to 2147483647.',
}

async function rough() {
  const permit = await newIssuedPermit(h.db, w, 'EL')
  const id = await scheduledInspection(h.db, w.inspector, permit.applicationId, 'rough')
  const [row] = await h.db.select().from(inspections).where(eq(inspections.id, id))
  return { inspectionId: id, expectedRowVersion: String(row?.rowVersion ?? 1) }
}

describeActionCases(h, 'recordResultAction', {
  invoke: recordResultAction,
  actor: () => w.inspector,
  input: async () => ({
    ...(await rough()),
    result: 'passed',
    notes: 'Looks good',
    'item:rough-1': 'pass',
  }),
  fields: {
    inspectionId: uuid({ required: true }),
    expectedRowVersion: int({ required: true, min: 1, max: 2_147_483_647 }),
    result: choice({ required: true }),
    notes: text({ max: 4000 }),
  },
  capability: 'inspection.record',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      inspectionId: 'Choose an inspection.',
      expectedRowVersion: VERSION,
      result: 'Choose a result.',
      notes: 'Enter the notes of 4000 characters or fewer.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({ ok: true, message: 'Result recorded.' })
    expect(written).toEqual([
      'audit_log',
      'inspection_item_results',
      'inspections',
      'notification_outbox',
    ])
  },
})

async function closable() {
  const permit = await newIssuedPermit(h.db, w, 'BP')
  const id = await scheduledInspection(h.db, w.inspector, permit.applicationId, 'final')
  const [row] = await h.db.select().from(inspections).where(eq(inspections.id, id))
  const recorded = await recordInspectionResult(
    h.db,
    w.inspector,
    {
      inspectionId: id,
      result: 'passed',
      items: await passingItems(h.db, permit.applicationId, 'final'),
      expectedRowVersion: row?.rowVersion ?? 1,
    },
    signal,
    { now: RESULT_NOW },
  )
  if (!recorded.ok) throw new Error(`final result failed ${JSON.stringify(recorded.error)}`)
  const [app] = await h.db
    .select()
    .from(applications)
    .where(eq(applications.id, permit.applicationId))
  return { applicationId: permit.applicationId, expectedRowVersion: String(app?.rowVersion ?? 1) }
}

describeActionCases(h, 'issueCertificateAction', {
  invoke: issueCertificateAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ ...(await closable()), issuedOn: '2027-07-07' }),
  fields: {
    applicationId: uuid({ required: true }),
    issuedOn: date({ required: true, earliest: '1900-01-01', latest: '2027-07-07' }),
    expectedRowVersion: int({ required: true, min: 1, max: 2_147_483_647 }),
  },
  capability: 'permit.issue',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose a permit.',
      issuedOn: {
        missing: 'Enter the issue date.',
        impossible_date: 'Enter the issue date as a date.',
        words: 'Enter the issue date as a date.',
        otherwise: 'Enter the issue date between January 1, 1900 and July 7, 2027.',
      },
      expectedRowVersion: {
        missing: 'Enter the version of the permit.',
        otherwise: 'Enter the version of the permit as a whole number from 1 to 2147483647.',
      },
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: expect.stringMatching(/^Certificate .+ issued\.$/),
    })
    expect(written).toEqual([
      'application_number_counters',
      'applications',
      'audit_log',
      'certificates_of_occupancy',
      'document_versions',
      'documents',
      'files',
      'parcel_record_links',
      'preservation_records',
      'retention_assignments',
    ])
  },
})

describe('inspection result sweep findings', () => {
  it('names the Notes field for 5250 characters and records nothing', async () => {
    h.signIn(w.inspector)
    const target = await rough()
    const outcome = await h.recordWrites(() =>
      recordResultAction(
        h.form({ ...target, result: 'failed', notes: 'x'.repeat(5250), 'item:rough-1': 'fail' }),
      ),
    )
    expect(outcome).toEqual({
      value: refuseField('notes', 'Enter the notes of 4000 characters or fewer.'),
      written: [],
    })
  })

  it('names the Notes field when a failure has fewer than 10 characters of notes', async () => {
    h.signIn(w.inspector)
    const result = await recordResultAction(
      h.form({ ...(await rough()), result: 'failed', notes: 'bad', 'item:rough-1': 'fail' }),
    )
    expect(result).toEqual(refuseField('notes', 'Write at least 10 characters about what failed.'))
  })
})
