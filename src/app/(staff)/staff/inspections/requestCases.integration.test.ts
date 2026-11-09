import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { inspections } from '@/db/schema'
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

const { requestInspectionAction } = await import('./actions')

const h = actionHarness()
let w: InspectionWorld

beforeAll(async () => {
  w = await setupInspectionWorld(h.db)
})

const PHONE_COPY = 'Enter the contact phone with 7 to 15 digits.'
const DATE_RANGE = 'between January 1, 1900 and December 31, 2099.'

describeActionCases(h, 'requestInspectionAction', {
  invoke: requestInspectionAction,
  actor: () => h.actorFor('staff'),
  input: async () => {
    const permit = await newIssuedPermit(h.db, w, 'EL')
    return {
      applicationId: permit.applicationId,
      checklistVersionId: await checklistIdFor(h.db, permit.applicationId, 'rough'),
      channel: 'phone',
      preferredDate: 'any',
      contactName: 'Pat Contact',
      contactPhone: '603-555-0100',
      accessNotes: 'Gate code 1234',
    }
  },
  fields: {
    applicationId: uuid({ required: true }),
    checklistVersionId: uuid({ required: true }),
    channel: choice({ required: true }),
    preferredDate: date({ earliest: '1900-01-01', latest: '2099-12-31' }),
    contactName: text({ required: true, max: 200 }),
    contactPhone: phone(),
    accessNotes: text({ max: 1000 }),
    reinspectionOf: uuid(),
  },
  capability: 'inspection.schedule',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalFor({
      applicationId: 'Choose a permit.',
      checklistVersionId: 'Choose an inspection.',
      channel: 'Choose how the request came in.',
      preferredDate: {
        impossible_date: 'Enter the preferred day as a date.',
        words: 'Enter the preferred day as a date.',
        otherwise: `Enter the preferred day ${DATE_RANGE}`,
      },
      contactName: {
        missing: 'Enter the contact name.',
        whitespace: 'Enter the contact name.',
        otherwise: 'Enter the contact name of 200 characters or fewer.',
      },
      contactPhone: PHONE_COPY,
      accessNotes: 'Enter the access notes of 1000 characters or fewer.',
      reinspectionOf: 'Choose the failed inspection to inspect again.',
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: (result, { written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Request taken.',
      createdId: expect.any(String),
    })
    expect(written).toEqual(['audit_log', 'inspections', 'parcel_record_links'])
  },
})

describe('inspection request sweep findings', () => {
  const request = async (extra: Record<string, string>) => {
    h.signIn(await h.actorFor('staff'))
    const permit = await newIssuedPermit(h.db, w, 'EL')
    return await requestInspectionAction(
      h.form({
        applicationId: permit.applicationId,
        checklistVersionId: await checklistIdFor(h.db, permit.applicationId, 'rough'),
        channel: 'counter',
        preferredDate: 'any',
        contactName: 'Pat Contact',
        ...extra,
      }),
    )
  }

  it('names the phone field for "abc" and takes a request with no phone', async () => {
    expect(await request({ contactPhone: 'abc' })).toEqual(refuseField('contactPhone', PHONE_COPY))
    expect(await request({ contactPhone: '' })).toEqual({
      ok: true,
      message: 'Request taken.',
      createdId: expect.any(String),
    })
  })

  it('returns the id of the request it recorded', async () => {
    const result = await request({ contactName: 'Pat Contact' })
    const createdId = result.ok ? result.createdId : undefined
    expect(createdId).toBeDefined()
    const [row] = await h.db
      .select({ status: inspections.status, contactName: inspections.contactName })
      .from(inspections)
      .where(eq(inspections.id, createdId ?? ''))
    expect(row).toEqual({ status: 'requested', contactName: 'Pat Contact' })
  })

  it('names the contact name field for a name of spaces', async () => {
    expect(await request({ contactName: '   ' })).toEqual(
      refuseField('contactName', 'Enter the contact name.'),
    )
  })

  it('refuses the portal channel from the staff form', async () => {
    expect(await request({ channel: 'portal' })).toEqual(
      refuseField('channel', 'Choose how the request came in.'),
    )
  })
})
