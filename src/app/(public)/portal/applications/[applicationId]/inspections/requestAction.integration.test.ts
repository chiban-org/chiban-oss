import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { ROLES } from '@/constants/roles'
import { inspections } from '@/db/schema'
import { refuseField } from '@/server/formInput'
import type { InspectionWorld } from '@/test/inspectionFixtures'
import { checklistIdFor, newIssuedPermit, setupInspectionWorld } from '@/test/inspectionFixtures'
import {
  actionHarness,
  describeActionCases,
  PORTAL_REFUSALS,
  phone,
  text,
  uuid,
} from '@/test/testHarness/actions'
import { describeForeignRecordCase } from '@/test/testHarness/actions/foreignRecord'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))
vi.mock('@/features/town/today', async (original) => ({
  ...(await original<typeof import('@/features/town/today')>()),
  townToday: () => Promise.resolve('2027-07-01'),
}))

const { portalRequestInspectionAction } = await import('./actions')

const h = actionHarness()
let w: InspectionWorld
beforeAll(async () => {
  w = await setupInspectionWorld(h.db)
})

async function requestInput() {
  const permit = await newIssuedPermit(h.db, w, 'EL')
  return {
    applicationId: permit.applicationId,
    checklistVersionId: await checklistIdFor(h.db, permit.applicationId, 'rough'),
    preferredDate: 'any',
    contactName: 'Alex Rivera',
    contactPhone: '603-555-0123',
    accessNotes: 'Gate code 1234',
  }
}

const COPY: Record<string, string> = {
  applicationId: 'Choose an application.',
  checklistVersionId: 'Choose an inspection.',
  contactName: 'Enter a contact name.',
  contactPhone: 'Enter a contact phone with 7 to 15 digits.',
  accessNotes: 'Enter access notes of 1000 characters or fewer.',
  preferredDate: 'Enter a preferred day as a date.',
}

describeActionCases(h, 'portalRequestInspectionAction', {
  invoke: portalRequestInspectionAction,
  actor: () => w.world.applicant,
  input: requestInput,
  fields: {
    applicationId: uuid({ required: true }),
    checklistVersionId: uuid({ required: true }),
    contactName: text({ required: true, max: 200 }),
    contactPhone: phone(),
    accessNotes: text({ max: 1000 }),
  },
  refusedRoles: ROLES,
  refusals: {
    ...PORTAL_REFUSALS,
    forbidden: { ok: false, error: 'That record was not found.' },
    invalid: (v) => {
      const copy =
        v.field === 'contactName' && v.kind === 'too_long'
          ? 'Enter a contact name of 200 characters or fewer.'
          : (COPY[v.field] ?? '')
      return refuseField(v.field, copy)
    },
  },
  accepted: async (result, { db, input }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Request sent. The land use office will schedule it.',
    })
    const rows = await db
      .select({
        channel: inspections.channel,
        status: inspections.status,
        contactName: inspections.contactName,
        contactPhone: inspections.contactPhone,
        accessNotes: inspections.accessNotes,
        preferredDate: inspections.preferredDate,
        requestedBy: inspections.requestedByUserId,
      })
      .from(inspections)
      .where(eq(inspections.applicationId, input.applicationId))
    expect(rows).toEqual([
      {
        channel: 'portal',
        status: 'requested',
        contactName: 'Alex Rivera',
        contactPhone: '603-555-0123',
        accessNotes: 'Gate code 1234',
        preferredDate: null,
        requestedBy: w.world.applicant.userId,
      },
    ])
  },
})

describeForeignRecordCase(h, 'portalRequestInspectionAction on another applicant record', {
  invoke: portalRequestInspectionAction,
  actor: () => w.stranger,
  input: requestInput,
  refusal: { ok: false, error: 'That record was not found.' },
})
