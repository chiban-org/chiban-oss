import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { complaints, enforcementCases } from '@/db/schema'
import { MAX_COMPLAINT_CHARS } from '@/features/enforcement/complaints'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { lazy } from '@/test/boardPanelFixtures'
import { intakeCase, investigatingCase } from '@/test/enforcementActionFixtures'
import { useEnforcementClock, wholeNumberMessage } from '@/test/enforcementCases'
import { type EnforcementWorld, setupEnforcementWorld } from '@/test/enforcementFixtures'
import { makeParcel } from '@/test/parcels'
import {
  actionHarness,
  choice,
  describeActionCases,
  type InvalidVariant,
  int,
  redirectsTo,
  STAFF_REFUSALS,
  settle,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
useEnforcementClock()
let world: EnforcementWorld

beforeAll(async () => {
  world = await setupEnforcementWorld(h.db)
})

const UNKNOWN_PARCEL = 'No parcel has that number or site address. Check it on the parcel page.'
const PARCEL_NOUN = 'a parcel number or site address'
const LOCATION_NOUN = 'where the property is'
const STATUS_VERSION = { min: 1, max: 2_147_483_647 }

const casesAt = (location: string) =>
  h.db.select().from(enforcementCases).where(eq(enforcementCases.locationText, location))

function openRefusal(variant: InvalidVariant) {
  return variant.field === 'locationText'
    ? refuseField('locationText', textMessage(LOCATION_NOUN, 300, variant))
    : refuseField('parcelRef', textMessage(PARCEL_NOUN, 200, variant))
}

describeActionCases(h, 'openCaseAction', {
  invoke: actions.openCaseAction,
  actor: () => world.staff,
  input: () => ({ locationText: '14 Birch Lane', parcelRef: '' }),
  fields: { locationText: text({ required: true, max: 300 }), parcelRef: text({ max: 200 }) },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: openRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    const [row] = await db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.locationText, '14 Birch Lane'))
    expect(result).toEqual(redirectsTo(`/staff/enforcement/${row?.id}`))
    expect(row).toMatchObject({ status: 'intake', assignedTo: world.staff.userId })
  },
})

describe('openCaseAction refusals and repeats', () => {
  it('opens one case for a double click in the same tick (C-08)', async () => {
    h.signIn(world.staff)
    const [first, second] = await Promise.all([
      settle(actions.openCaseAction(h.form({ locationText: 'FS-C 20 Test Rd' }))),
      settle(actions.openCaseAction(h.form({ locationText: 'FS-C 20 Test Rd' }))),
    ])
    const rows = await casesAt('FS-C 20 Test Rd')
    expect(rows).toHaveLength(1)
    expect(first).toEqual(redirectsTo(`/staff/enforcement/${rows[0]?.id}`))
    expect(second).toEqual(first)
  })

  it('opens a second case when a different officer files the same location', async () => {
    h.signIn(world.staff)
    await settle(actions.openCaseAction(h.form({ locationText: '7 Shared Way' })))
    h.signIn(world.inspector)
    await settle(actions.openCaseAction(h.form({ locationText: '7 Shared Way' })))
    expect(await casesAt('7 Shared Way')).toHaveLength(2)
  })

  it('opens a second case for a different location from the same officer', async () => {
    h.signIn(world.staff)
    await settle(actions.openCaseAction(h.form({ locationText: '8 Alder Court' })))
    await settle(actions.openCaseAction(h.form({ locationText: '9 Alder Court' })))
    expect(await casesAt('8 Alder Court')).toHaveLength(1)
    expect(await casesAt('9 Alder Court')).toHaveLength(1)
  })

  it('names the location field for a location of spaces and for one over 300 characters (C-07)', async () => {
    h.signIn(world.staff)
    expect(await actions.openCaseAction(h.form({ locationText: '   ' }))).toEqual(
      refuseField('locationText', 'Enter where the property is.'),
    )
    expect(await actions.openCaseAction(h.form({ locationText: 'x'.repeat(301) }))).toEqual(
      refuseField('locationText', 'Enter where the property is of 300 characters or fewer.'),
    )
  })

  it('names the parcel field when no parcel has that number', async () => {
    h.signIn(world.staff)
    const result = await actions.openCaseAction(
      h.form({ locationText: '3 Nowhere Rd', parcelRef: 'no such parcel' }),
    )
    expect(result).toEqual(refuseField('parcelRef', UNKNOWN_PARCEL))
    expect(await casesAt('3 Nowhere Rd')).toHaveLength(0)
  })
})

function complaintRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'locationText':
      return refuseField('locationText', textMessage(LOCATION_NOUN, 300, variant))
    case 'description':
      return refuseField(
        'description',
        textMessage('what was reported', MAX_COMPLAINT_CHARS, variant),
      )
    case 'name':
      return refuseField('name', textMessage('the complainant name', 200, variant))
    case 'phone':
      return refuseField('phone', textMessage('the complainant phone number', 40, variant))
    default:
      return refuseField('parcelRef', textMessage(PARCEL_NOUN, 200, variant))
  }
}

describeActionCases(h, 'staffComplaintAction', {
  invoke: actions.staffComplaintAction,
  actor: () => world.staff,
  input: () => ({
    locationText: '5 Quarry Road',
    description: 'Trucks are parking on the shoulder overnight.',
    parcelRef: '',
    name: 'Pat Neighbor',
    phone: '603-555-0142',
    email: 'pat@example.org',
  }),
  fields: {
    locationText: text({ required: true, max: 300 }),
    description: text({ required: true, max: MAX_COMPLAINT_CHARS }),
    parcelRef: text({ max: 200 }),
    name: text({ max: 200 }),
    phone: text({ max: 40 }),
  },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: complaintRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    const rows = await db
      .select({
        channel: complaints.channel,
        description: complaints.descriptionOriginal,
        name: complaints.complainantName,
        phone: complaints.complainantPhone,
        email: complaints.complainantEmail,
        caseId: complaints.caseId,
      })
      .from(complaints)
      .where(eq(complaints.locationText, '5 Quarry Road'))
    expect(rows).toEqual([
      {
        channel: 'staff_entry',
        description: 'Trucks are parking on the shoulder overnight.',
        name: 'Pat Neighbor',
        phone: '603-555-0142',
        email: 'pat@example.org',
        caseId: expect.any(String),
      },
    ])
    expect(result).toEqual(redirectsTo(`/staff/enforcement/${rows[0]?.caseId}`))
  },
})

const forParcel = lazy(async () => ({
  caseId: (await intakeCase(h.db, world, '11 Heron Lane')).caseId,
  parcelId: await makeParcel(h.db, [{ format: 'gis12', value: '031007000000' }]),
}))

describeActionCases(h, 'setCaseParcelAction', {
  invoke: actions.setCaseParcelAction,
  actor: () => world.staff,
  input: async () => ({ caseId: (await forParcel()).caseId, parcelRef: '031007000000' }),
  fields: { caseId: uuid({ required: true }), parcelRef: text({ required: true, max: 200 }) },
  capability: 'enforcement.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: (variant) =>
      variant.field === 'caseId'
        ? refuseField('caseId', idMessage('a case'))
        : refuseField('parcelRef', textMessage(PARCEL_NOUN, 200, variant)),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db }) => {
    const { caseId, parcelId } = await forParcel()
    expect(result).toEqual({ ok: true, message: 'Parcel linked.' })
    const [row] = await db.select().from(enforcementCases).where(eq(enforcementCases.id, caseId))
    expect(row?.parcelId).toBe(parcelId)
  },
})

describe('setCaseParcelAction with no matching parcel', () => {
  it('names the parcel field and links nothing', async () => {
    h.signIn(world.staff)
    const { caseId } = await intakeCase(h.db, world, '12 Heron Lane')
    const { value, written } = await h.recordWrites(() =>
      actions.setCaseParcelAction(h.form({ caseId, parcelRef: 'no such parcel' })),
    )
    expect({ value, written }).toEqual({
      value: refuseField('parcelRef', UNKNOWN_PARCEL),
      written: [],
    })
  })
})

const forStatus = lazy(async () => await investigatingCase(h.db, world, '13 Heron Lane'))

function statusRefusal(variant: InvalidVariant) {
  switch (variant.field) {
    case 'caseId':
      return refuseField('caseId', idMessage('a case'))
    case 'expectedRowVersion':
      return refuseField(
        'expectedRowVersion',
        wholeNumberMessage('the version of this record', STATUS_VERSION, variant),
      )
    case 'to':
      return refuseField('to', 'Choose a status.')
    default:
      return refuseField('reason', textMessage('a reason', 1000, variant))
  }
}

describeActionCases(h, 'setCaseStatusAction', {
  invoke: actions.setCaseStatusAction,
  actor: () => world.staff,
  input: async () => ({
    caseId: (await forStatus()).caseId,
    expectedRowVersion: '2',
    to: 'no_violation',
    reason: '',
  }),
  fields: {
    caseId: uuid({ required: true }),
    expectedRowVersion: int({ required: true, ...STATUS_VERSION }),
    to: choice({ required: true }),
    reason: text({ max: 1000 }),
  },
  capability: 'enforcement.manage',
  refusals: { ...STAFF_REFUSALS, invalid: statusRefusal, checkOnly: CHECK_PASSED },
  accepted: async (result, { db }) => {
    expect(result).toEqual({ ok: true, message: 'Status changed.' })
    const [row] = await db
      .select()
      .from(enforcementCases)
      .where(eq(enforcementCases.id, (await forStatus()).caseId))
    expect(row?.status).toBe('no_violation')
  },
})

describe('setCaseStatusAction refusals the feature owns', () => {
  it('names the reason field when a case is closed without one', async () => {
    h.signIn(world.staff)
    const { caseId } = await investigatingCase(h.db, world, '14 Heron Lane')
    await actions.setCaseStatusAction(
      h.form({ caseId, expectedRowVersion: '2', to: 'no_violation', reason: '' }),
    )
    const { value, written } = await h.recordWrites(() =>
      actions.setCaseStatusAction(
        h.form({ caseId, expectedRowVersion: '3', to: 'closed', reason: '   ' }),
      ),
    )
    expect({ value, written }).toEqual({
      value: refuseField('reason', 'Enter the reason the case is being closed.'),
      written: [],
    })
  })

  it('names the status field for a step the case cannot take', async () => {
    h.signIn(world.staff)
    const { caseId } = await investigatingCase(h.db, world, '15 Heron Lane')
    const result = await actions.setCaseStatusAction(
      h.form({ caseId, expectedRowVersion: '2', to: 'closed', reason: 'No longer needed' }),
    )
    expect(result).toEqual(refuseField('to', 'That step is not available from the current status.'))
  })
})
