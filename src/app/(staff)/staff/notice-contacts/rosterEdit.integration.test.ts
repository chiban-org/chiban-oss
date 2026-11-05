import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { associationRosters, auditLog, parkRosters, restrictionHoldings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (name === 'chiban_csrf' ? { value: 'tok' } : undefined),
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const rosters = await import('./rosterActions')
const holders = await import('./actions')

let handle: TestDb
let world: BoardWorld
let condoParcel: string
let parkParcel: string

const CONDO_ID = '021004000000'
const PARK_ID = '021005000000'
const FORBIDDEN = { ok: false, error: 'You do not have permission to do this.' }

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
  condoParcel = await makeParcel(handle.db, [{ format: 'gis12', value: CONDO_ID }])
  parkParcel = await makeParcel(handle.db, [{ format: 'gis12', value: PARK_ID }])
  state.actor = world.staff
})
afterAll(async () => {
  await handle.drop()
})

function form(fields: Record<string, string | string[]>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) {
    for (const one of Array.isArray(v) ? v : [v]) f.append(k, one)
  }
  return f
}

async function auditFor(action: string, entityId: string) {
  return await handle.db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.action, action), eq(auditLog.entityId, entityId)))
}

const association = {
  associationName: 'Heron Landing Condominium',
  asOf: '2026-10-01',
  officerName: ['Dana Whitcomb'],
  officerTitle: ['President'],
  officerAddress: ['PO Box 105, Alder Pond NH 03999'],
}

const park = {
  parkName: 'Loon Cove Park',
  ownerName: 'Loon Cove LLC',
  ownerMailingAddress: '1 Cove Road, Alder Pond NH 03999',
  asOf: '2026-10-01',
  tenantId: [''],
  tenantName: ['Rory Pike'],
  tenantSite: ['Site 4'],
  tenantAddress: ['4 Merganser Court, Alder Pond NH 03999'],
}

describe('association rosters', () => {
  it('adds a roster for a parcel that has none', async () => {
    const result = await rosters.addAssociationAction(form({ parcelRef: CONDO_ID, ...association }))
    expect(result).toEqual({ ok: true, message: 'Association added.' })
    expect(await auditFor('roster.association.add', condoParcel)).toHaveLength(1)
  })

  it('refuses a second roster for the same parcel and points to Edit', async () => {
    const result = await rosters.addAssociationAction(
      form({ parcelRef: CONDO_ID, ...association, associationName: 'Someone Else' }),
    )
    expect(result).toEqual({
      ok: false,
      error: 'This parcel already has an association on file. Use Edit on its row to change it.',
    })
    const [row] = await handle.db
      .select()
      .from(associationRosters)
      .where(eq(associationRosters.parcelId, condoParcel))
    expect(row?.associationName).toBe('Heron Landing Condominium')
  })

  it('edits the listed roster and records what it was before', async () => {
    const result = await rosters.updateAssociationAction(
      form({
        parcelId: condoParcel,
        ...association,
        associationName: 'Heron Landing Owners Association',
        officerName: ['Dana Whitcomb', 'Lee Marsh'],
        officerTitle: ['President', 'Treasurer'],
        officerAddress: ['PO Box 105, Alder Pond NH 03999', '12 Loon Road, Alder Pond NH 03999'],
      }),
    )
    expect(result).toEqual({ ok: true, message: 'Association saved.' })
    const [row] = await handle.db
      .select()
      .from(associationRosters)
      .where(eq(associationRosters.parcelId, condoParcel))
    expect(row?.associationName).toBe('Heron Landing Owners Association')
    expect(row?.officers).toHaveLength(2)
    const [entry] = await auditFor('roster.association.update', condoParcel)
    expect(entry?.before).toMatchObject({
      associationName: 'Heron Landing Condominium',
      officers: [
        {
          name: 'Dana Whitcomb',
          title: 'President',
          mailingAddress: 'PO Box 105, Alder Pond NH 03999',
        },
      ],
    })
    expect(entry?.after).toMatchObject({
      associationName: 'Heron Landing Owners Association',
      officers: [{ name: 'Dana Whitcomb' }, { name: 'Lee Marsh' }],
    })
  })

  it('refuses an edit with no officers', async () => {
    const result = await rosters.updateAssociationAction(
      form({ parcelId: condoParcel, ...association, officerName: [''], officerAddress: [''] }),
    )
    expect(result).toEqual({
      ok: false,
      error: 'Enter at least one officer, each with a name and a mailing address.',
    })
  })

  it('refuses an edit for a parcel with no roster', async () => {
    const result = await rosters.updateAssociationAction(
      form({ parcelId: parkParcel, ...association }),
    )
    expect(result).toEqual({ ok: false, error: 'That record was not found.' })
  })

  it('refuses an edit from someone who does not keep the rosters', async () => {
    state.actor = world.reviewer
    const result = await rosters.updateAssociationAction(
      form({ parcelId: condoParcel, ...association, associationName: 'Taken Over' }),
    )
    state.actor = world.staff
    expect(result).toEqual(FORBIDDEN)
  })
})

describe('park rosters', () => {
  it('adds a park, refuses a second one, and edits the first', async () => {
    expect(await rosters.addParkAction(form({ parcelRef: PARK_ID, ...park }))).toEqual({
      ok: true,
      message: 'Park added.',
    })
    expect(await rosters.addParkAction(form({ parcelRef: PARK_ID, ...park }))).toEqual({
      ok: false,
      error: 'This parcel already has a park on file. Use Edit on its row to change it.',
    })
    const edited = await rosters.updateParkAction(
      form({
        parcelId: parkParcel,
        ...park,
        tenantId: ['site-4'],
        tenantSite: ['Lot 4'],
        ownerName: 'Loon Cove Holdings LLC',
      }),
    )
    expect(edited).toEqual({ ok: true, message: 'Park saved.' })
    const [row] = await handle.db
      .select()
      .from(parkRosters)
      .where(eq(parkRosters.parcelId, parkParcel))
    expect(row?.ownerName).toBe('Loon Cove Holdings LLC')
    expect(row?.tenants.map((t) => t.tenantId)).toEqual(['site-4'])
    const [entry] = await auditFor('roster.park.update', parkParcel)
    expect(entry?.before).toMatchObject({
      parkName: 'Loon Cove Park',
      ownerName: 'Loon Cove LLC',
      tenants: [{ tenantId: 'site-4', name: 'Rory Pike', siteLabel: 'Site 4' }],
    })
  })

  it('refuses a park edit from someone who does not keep the rosters', async () => {
    state.actor = world.reviewer
    const result = await rosters.updateParkAction(form({ parcelId: parkParcel, ...park }))
    state.actor = world.staff
    expect(result).toEqual(FORBIDDEN)
  })
})

describe('restriction holders', () => {
  const holder = {
    holderName: 'Alder Pond Land Trust',
    holderMailingAddress: '1 Trust Way, Alder Pond NH 03999',
    restrictionKind: 'conservation',
    recordedReference: 'Book 1 Page 2',
  }

  async function addedHolding(): Promise<string> {
    await holders.addRestrictionAction(form({ parcelRef: CONDO_ID, ...holder }))
    const [row] = await handle.db
      .select()
      .from(restrictionHoldings)
      .where(eq(restrictionHoldings.parcelId, condoParcel))
    return row?.id ?? ''
  }

  it('edits a holder and records the change', async () => {
    const holdingId = await addedHolding()
    const result = await holders.updateRestrictionAction(
      form({ holdingId, ...holder, holderName: 'Alder Pond Conservation Trust' }),
    )
    expect(result).toEqual({ ok: true, message: 'Restriction holder saved.' })
    const [row] = await handle.db
      .select()
      .from(restrictionHoldings)
      .where(eq(restrictionHoldings.id, holdingId))
    expect(row?.holderName).toBe('Alder Pond Conservation Trust')
    const [entry] = await auditFor('roster.restriction.update', condoParcel)
    expect(entry?.before).toMatchObject({ holdingId, holderName: 'Alder Pond Land Trust' })
    expect(entry?.after).toMatchObject({ holderName: 'Alder Pond Conservation Trust' })
  })

  it('refuses a holder edit with no mailing address or from a reviewer', async () => {
    const [row] = await handle.db.select().from(restrictionHoldings)
    const holdingId = row?.id ?? ''
    expect(
      await holders.updateRestrictionAction(
        form({ holdingId, ...holder, holderMailingAddress: ' ' }),
      ),
    ).toEqual({ ok: false, error: 'Enter a mailing address.' })
    state.actor = world.reviewer
    const refused = await holders.updateRestrictionAction(form({ holdingId, ...holder }))
    state.actor = world.staff
    expect(refused).toEqual(FORBIDDEN)
  })
})
