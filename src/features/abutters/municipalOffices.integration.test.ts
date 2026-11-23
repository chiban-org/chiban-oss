import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationMunicipalities, sourceWaterDeterminations } from '@/db/schema'
import { resolveMunicipalOffices, resolveWaterSupplier } from '@/features/abutters/municipalOffices'
import type { IncompleteReason } from '@/features/abutters/types'
import { type BoardWorld, setupBoardWorld, submitBoardApplication } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

let handle: TestDb
let world: BoardWorld
let applicationId: string

const CONTACTS = {
  key: 'default',
  commission: null,
  nhDes: null,
  municipalities: [
    {
      key: 'pine_river',
      name: 'Town of Pine River',
      mailingAddress: '4 Town Hall Road, Pine River',
      clerk: { name: 'Pine River Town Clerk', mailingAddress: '4 Town Hall Road, Pine River' },
      reviewingAuthority: {
        name: 'Pine River Planning Board',
        mailingAddress: '6 Board Lane, Pine River',
      },
    },
    {
      key: 'dunmore',
      name: 'Town of Dunmore',
      mailingAddress: '9 Common Street, Dunmore',
      clerk: { name: 'Dunmore Town Clerk', mailingAddress: '9 Common Street, Dunmore' },
    },
  ],
  waterSuppliers: [
    {
      key: 'lakeside_water',
      name: 'Lakeside Water District',
      mailingAddress: '2 Pump Road, Lakeside',
    },
  ],
}

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  applicationId = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
  await saveAndPublish(handle.db, world.admin, 'regional_contacts', 'default', CONTACTS)
})
afterEach(async () => {
  await handle.drop()
})

function context() {
  const incomplete: IncompleteReason[] = []
  return {
    ctx: {
      tx: handle.db,
      input: { applicationId },
      signal: new AbortController().signal,
      incomplete,
    },
    incomplete,
  }
}

async function listMunicipalities(...keys: [string, 'abutting' | 'includes'][]) {
  await handle.db
    .insert(applicationMunicipalities)
    .values(
      keys.map(([municipalityKey, relation]) => ({ applicationId, municipalityKey, relation })),
    )
}

describe('resolveMunicipalOffices', () => {
  it('returns no one when no municipality is listed', async () => {
    const { ctx, incomplete } = context()
    expect(await resolveMunicipalOffices(ctx)).toEqual([])
    expect(incomplete).toEqual([])
  })

  it('returns a clerk and a reviewing authority for a fully listed municipality', async () => {
    await listMunicipalities(['pine_river', 'abutting'])
    const { ctx, incomplete } = context()
    const out = await resolveMunicipalOffices(ctx)
    expect(out.map((r) => [r.roles, r.name, r.mailingAddress, r.status])).toEqual([
      [['municipal_clerk'], 'Pine River Town Clerk', '4 Town Hall Road, Pine River', 'ok'],
      [
        ['municipal_reviewing_authority'],
        'Pine River Planning Board',
        '6 Board Lane, Pine River',
        'ok',
      ],
    ])
    expect(out[0]?.provenance[0]).toMatchObject({ source: 'regional_contacts', ref: 'pine_river' })
    expect(incomplete).toEqual([])
  })

  it('a missing reviewing authority is incomplete and the clerk is still returned', async () => {
    await listMunicipalities(['dunmore', 'includes'])
    const { ctx, incomplete } = context()
    const out = await resolveMunicipalOffices(ctx)
    expect(out.map((r) => r.roles)).toEqual([['municipal_clerk']])
    expect(incomplete.map((i) => i.code)).toEqual(['regional_contacts_missing'])
    expect(incomplete[0]?.detail).toContain('dunmore')
  })

  it('a municipality absent from the contacts is incomplete for both offices', async () => {
    await listMunicipalities(['elsewhere', 'abutting'])
    const { ctx, incomplete } = context()
    expect(await resolveMunicipalOffices(ctx)).toEqual([])
    expect(incomplete.map((i) => i.code)).toEqual([
      'regional_contacts_missing',
      'regional_contacts_missing',
    ])
  })
})

describe('resolveWaterSupplier', () => {
  async function determine(determination: 'within' | 'not_within', supplierKey: string | null) {
    await handle.db.insert(sourceWaterDeterminations).values({
      applicationId,
      determination,
      supplierKey,
      determinedBy: world.staff.userId,
      determinedOn: '2027-03-24',
    })
  }

  it('no determination is determination_missing', async () => {
    const { ctx, incomplete } = context()
    expect(await resolveWaterSupplier(ctx)).toEqual([])
    expect(incomplete.map((i) => i.code)).toEqual(['determination_missing'])
  })

  it('not within returns no one', async () => {
    await determine('not_within', null)
    const { ctx, incomplete } = context()
    expect(await resolveWaterSupplier(ctx)).toEqual([])
    expect(incomplete).toEqual([])
  })

  it('within returns the supplier the determination names', async () => {
    await determine('within', 'lakeside_water')
    const { ctx, incomplete } = context()
    const out = await resolveWaterSupplier(ctx)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      roles: ['water_supplier'],
      name: 'Lakeside Water District',
      mailingAddress: '2 Pump Road, Lakeside',
      status: 'ok',
    })
    expect(out[0]?.provenance[0]).toMatchObject({
      source: 'regional_contacts',
      ref: 'lakeside_water',
    })
    expect(incomplete).toEqual([])
  })

  it('within a supplier with no contact on file is incomplete', async () => {
    await determine('within', 'unlisted_supplier')
    const { ctx, incomplete } = context()
    expect(await resolveWaterSupplier(ctx)).toEqual([])
    expect(incomplete.map((i) => i.code)).toEqual(['regional_contacts_missing'])
  })
})
