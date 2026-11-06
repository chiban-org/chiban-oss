import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { associationRosters, parkRosters } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import { idMessage, textMessage } from '@/test/boardCases'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { PAST_ONLY, pastDateMessage, useEnforcementClock } from '@/test/enforcementCases'
import { refusalBy } from '@/test/refusalCopy'
import { freshParcel, listedAssociation, listedPark } from '@/test/rosterCaseFixtures'
import {
  actionHarness,
  date,
  describeActionCases,
  type InvalidVariant,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./rosterActions')

const h = actionHarness()
useEnforcementClock()
let world: BoardWorld

beforeAll(async () => {
  world = await setupBoardWorld(h.db)
})

const staff = () => h.actorFor('staff')

const OFFICERS = {
  officerName: ['Dana Whitcomb'],
  officerTitle: ['President'],
  officerAddress: ['PO Box 105, Alder Pond NH 03999'],
}

const TENANTS = {
  tenantId: [''],
  tenantName: ['Rory Pike'],
  tenantSite: ['Site 4'],
  tenantAddress: ['4 Merganser Court, Alder Pond NH 03999'],
}

const AS_OF = (v: InvalidVariant) => pastDateMessage('the date the list is current', v)

const associationCopy = {
  associationName: (v: InvalidVariant) => textMessage('the association name', 200, v),
  asOf: AS_OF,
}

const parkCopy = {
  parkName: (v: InvalidVariant) => textMessage('the park name', 200, v),
  ownerName: (v: InvalidVariant) => textMessage('the owner name', 200, v),
  ownerMailingAddress: (v: InvalidVariant) => textMessage('the owner mailing address', 300, v),
  asOf: AS_OF,
}

const associationFields = {
  associationName: text({ required: true, max: 200 }),
  asOf: date({ required: true, ...PAST_ONLY }),
}

const parkFields = {
  parkName: text({ required: true, max: 200 }),
  ownerName: text({ required: true, max: 200 }),
  ownerMailingAddress: text({ required: true, max: 300 }),
  asOf: date({ required: true, ...PAST_ONLY }),
}

const associationInput = {
  associationName: 'Heron Landing Condominium',
  asOf: '2027-07-10',
  ...OFFICERS,
}

const parkInput = {
  parkName: 'Loon Cove Park',
  ownerName: 'Loon Cove LLC',
  ownerMailingAddress: '1 Cove Road, Alder Pond NH 03999',
  asOf: '2027-07-10',
  ...TENANTS,
}

describeActionCases(h, 'addAssociationAction', {
  invoke: actions.addAssociationAction,
  actor: staff,
  input: async () => ({ parcelRef: (await freshParcel(h.db)).ref, ...associationInput }),
  fields: { parcelRef: text({ required: true, max: 200 }), ...associationFields },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ parcelRef: (v) => textMessage('the parcel', 200, v), ...associationCopy }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Association added.' })
    expect(written).toEqual(expect.arrayContaining(['association_rosters', 'audit_log']))
    const rows = await db
      .select({ name: associationRosters.associationName, asOf: associationRosters.asOf })
      .from(associationRosters)
    expect(rows).toContainEqual({ name: 'Heron Landing Condominium', asOf: '2027-07-10' })
  },
})

describeActionCases(h, 'updateAssociationAction', {
  invoke: actions.updateAssociationAction,
  actor: staff,
  input: async () => ({
    parcelId: (await listedAssociation(h.db, world.staff)).parcelId,
    ...associationInput,
    associationName: 'Heron Landing Owners Association',
  }),
  fields: { parcelId: uuid({ required: true }), ...associationFields },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ parcelId: () => idMessage('a parcel'), ...associationCopy }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Association saved.' })
    expect(written).toEqual(expect.arrayContaining(['association_rosters', 'audit_log']))
    const [row] = await db
      .select({ name: associationRosters.associationName })
      .from(associationRosters)
      .where(eq(associationRosters.parcelId, String(input.parcelId)))
    expect(row?.name).toBe('Heron Landing Owners Association')
  },
})

describeActionCases(h, 'addParkAction', {
  invoke: actions.addParkAction,
  actor: staff,
  input: async () => ({ parcelRef: (await freshParcel(h.db)).ref, ...parkInput }),
  fields: { parcelRef: text({ required: true, max: 200 }), ...parkFields },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ parcelRef: (v) => textMessage('the parcel', 200, v), ...parkCopy }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, written }) => {
    expect(result).toEqual({ ok: true, message: 'Park added.' })
    expect(written).toEqual(expect.arrayContaining(['park_rosters', 'audit_log']))
    const rows = await db.select({ name: parkRosters.parkName }).from(parkRosters)
    expect(rows).toContainEqual({ name: 'Loon Cove Park' })
  },
})

describeActionCases(h, 'updateParkAction', {
  invoke: actions.updateParkAction,
  actor: staff,
  input: async () => ({
    parcelId: (await listedPark(h.db, world.staff)).parcelId,
    ...parkInput,
    parkName: 'Loon Cove Cooperative',
  }),
  fields: { parcelId: uuid({ required: true }), ...parkFields },
  capability: 'abutters.manage',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({ parcelId: () => idMessage('a parcel'), ...parkCopy }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { db, input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Park saved.' })
    expect(written).toEqual(expect.arrayContaining(['park_rosters', 'audit_log']))
    const [row] = await db
      .select({ name: parkRosters.parkName })
      .from(parkRosters)
      .where(eq(parkRosters.parcelId, String(input.parcelId)))
    expect(row?.name).toBe('Loon Cove Cooperative')
  },
})

describe('the sweep findings on association and park lists', () => {
  it('names the park name field for a name of three spaces and adds nothing', async () => {
    h.signIn(await staff())
    const form = h.form({
      parcelRef: (await freshParcel(h.db)).ref,
      ...parkInput,
      parkName: '   ',
    })
    const outcome = await h.recordWrites(() => actions.addParkAction(form))
    expect(outcome).toEqual({
      value: refuseField('parkName', 'Enter the park name.'),
      written: [],
    })
  })

  it('names the date field for a list dated 2099 and saves nothing', async () => {
    h.signIn(await staff())
    const form = h.form({
      parcelId: (await listedAssociation(h.db, world.staff)).parcelId,
      ...associationInput,
      asOf: '2099-01-01',
    })
    const outcome = await h.recordWrites(() => actions.updateAssociationAction(form))
    expect(outcome).toEqual({
      value: refuseField(
        'asOf',
        'Enter the date the list is current between January 1, 1900 and July 20, 2027.',
      ),
      written: [],
    })
  })

  it('names the officer field when an officer has no mailing address', async () => {
    h.signIn(await staff())
    const result = await actions.addAssociationAction(
      h.form({
        parcelRef: (await freshParcel(h.db)).ref,
        ...associationInput,
        officerAddress: [''],
      }),
    )
    expect(result).toEqual(
      refuseField(
        'officerName',
        'Enter at least one officer, each with a name and a mailing address.',
      ),
    )
  })

  it('names the parcel field for a parcel ID that is not on file', async () => {
    h.signIn(await staff())
    const result = await actions.addAssociationAction(
      h.form({ parcelRef: '999999999998', ...associationInput }),
    )
    expect(result).toEqual(
      refuseField(
        'parcelRef',
        'No parcel has the ID 999999999998. Check the parcel ID and try again.',
      ),
    )
  })
})
