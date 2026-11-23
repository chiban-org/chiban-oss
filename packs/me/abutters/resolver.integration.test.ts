import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applicationMunicipalities, sourceWaterDeterminations } from '@/db/schema'
import { type ResolverOutput, recipientResolver } from '@/features/abutters/resolution'
import type { AbuttersSpec, RecipientRole } from '@/features/abutters/roles'
import { setActivePackForTest } from '@/features/packs/registry'
import '@/features/packs/registryAbutters'
import { TOWN_PROFILE_SKELETON } from '@/features/town/profileSchema'
import { importScenario } from '@/test/abutterWorld'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { saveAndPublish } from '@/test/configFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  ME_APPLICANT_ADDRESS,
  ME_TEST_CONTACTS,
  maineBoardPack,
  submitMaineApplication,
} from '@/test/maineAbutterWorld'
import { ME_PACK } from '../index'

const signal = new AbortController().signal
const NOW = new Date('2027-03-24T16:00:00Z')
const ME_RESOLVER = 'me.recipients.v1'
let handle: TestDb
let world: BoardWorld
let ids: Record<string, string>
let applicationId: string

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  ids = await importScenario(handle.db, world.staff)
  await saveAndPublish(handle.db, world.admin, 'regional_contacts', 'default', ME_TEST_CONTACTS)
  const pack = maineBoardPack({ roles: ['applicant'], conditionalRoles: [] })
  setActivePackForTest(pack)
  applicationId = await submitMaineApplication(handle.db, world, pack, ids.A ?? '')
  setActivePackForTest(ME_PACK)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})

function idOf(name: string): string {
  return new Map(Object.entries(ids)).get(name) ?? ''
}

async function resolve(
  names: string[],
  roles: RecipientRole[],
  conditionalRoles: AbuttersSpec['conditionalRoles'] = [],
): Promise<ResolverOutput> {
  return await handle.db.transaction((tx) =>
    recipientResolver(ME_RESOLVER).resolve(
      tx,
      {
        applicationId,
        candidates: names.map((n) => ({ parcelId: idOf(n), reasons: [{ kind: 'adjacent' }] })),
        roles,
        conditionalRoles,
        now: NOW,
      },
      signal,
    ),
  )
}

const withRole = (output: ResolverOutput, role: RecipientRole) =>
  output.recipients.filter((r) => r.roles.includes(role))

async function listMunicipalities(...keys: string[]) {
  await handle.db.insert(applicationMunicipalities).values(
    keys.map((municipalityKey) => ({
      applicationId,
      municipalityKey,
      relation: 'abutting' as const,
    })),
  )
}

async function determineWater(determination: 'within' | 'not_within', supplierKey: string | null) {
  await handle.db.insert(sourceWaterDeterminations).values({
    applicationId,
    determination,
    supplierKey,
    determinedBy: world.staff.userId,
    determinedOn: '2027-03-24',
  })
}

describe('owners and the applicant', () => {
  it('lists the applicant first and the record owner of each candidate parcel', async () => {
    const output = await resolve(['SW', 'SE'], ['applicant', 'abutter_owner'])
    expect(output.recipients[0]).toMatchObject({
      roles: ['applicant'],
      mailingAddress: ME_APPLICANT_ADDRESS,
      status: 'ok',
    })
    const owners = withRole(output, 'abutter_owner')
    expect(owners.map((r) => r.parcelIds)).toEqual([[idOf('SW')], [idOf('SE')]])
    expect(owners[0]).toMatchObject({ name: 'Wren, Isolde', status: 'ok' })
    expect(owners[0]?.provenance[0]).toMatchObject({ source: 'parcel_record', ref: idOf('SW') })
    expect(output.incomplete).toEqual([])
  })

  it('reports a parcel with no owner name and one with no mailing address', async () => {
    await handle.db.execute(sql`update parcels set owner_name = null where id = ${idOf('SW')}`)
    await handle.db.execute(sql`update parcels set mailing_address = null where id = ${idOf('SE')}`)
    const output = await resolve(['SW', 'SE'], ['abutter_owner'])
    expect(output.incomplete).toEqual([
      {
        code: 'owner_missing',
        detail: 'The parcel record has no owner name.',
        parcelId: idOf('SW'),
      },
      {
        code: 'address_missing',
        detail: 'The parcel record has no mailing address for Teasel Family Trust.',
        parcelId: idOf('SE'),
      },
    ])
    expect(withRole(output, 'abutter_owner').map((r) => r.status)).toEqual([
      'incomplete_data',
      'incomplete_data',
    ])
  })

  it('merges an owner of two candidate parcels into one recipient', async () => {
    await handle.db.execute(
      sql`update parcels set owner_name = 'Wren, Isolde', mailing_address = 'PO Box 302, Fernhollow, ME 04000' where id in (${idOf('SW')}, ${idOf('SE')})`,
    )
    const owners = withRole(await resolve(['SW', 'SE'], ['abutter_owner']), 'abutter_owner')
    expect(owners).toHaveLength(1)
    expect(owners[0]?.parcelIds).toEqual([idOf('SW'), idOf('SE')])
  })
})

describe('municipal offices', () => {
  const offices: RecipientRole[] = ['municipal_clerk', 'municipal_reviewing_authority']

  it('lists the clerk and the reviewing authority of a recorded neighbouring municipality', async () => {
    await listMunicipalities('pine_river')
    const output = await resolve([], offices)
    expect(output.recipients.map((r) => [r.roles, r.name])).toEqual([
      [['municipal_clerk'], 'Pine River Town Clerk'],
      [['municipal_reviewing_authority'], 'Pine River Planning Board'],
    ])
    expect(output.incomplete).toEqual([])
  })

  it('reports a municipality with no reviewing authority on file', async () => {
    await listMunicipalities('dunmore')
    const output = await resolve([], offices)
    expect(output.recipients.map((r) => r.roles)).toEqual([['municipal_clerk']])
    expect(output.incomplete).toEqual([
      {
        code: 'regional_contacts_missing',
        detail: 'The reviewing authority of dunmore has no mailing address on file.',
        role: 'municipal_reviewing_authority',
      },
    ])
  })

  it('leaves the offices out when the notice does not name them', async () => {
    await listMunicipalities('dunmore')
    const output = await resolve([], ['applicant'])
    expect(output.recipients.map((r) => r.roles)).toEqual([['applicant']])
    expect(output.incomplete).toEqual([])
  })
})

describe('the water supplier', () => {
  const water: AbuttersSpec['conditionalRoles'] = [
    { role: 'water_supplier', when: 'source_water_area' },
  ]

  it('reports a missing determination and lists no supplier', async () => {
    const output = await resolve([], ['applicant'], water)
    expect(withRole(output, 'water_supplier')).toEqual([])
    expect(output.incomplete.map((i) => [i.code, i.role])).toEqual([
      ['determination_missing', 'water_supplier'],
    ])
  })

  it('lists no supplier when the property is not within a source water area', async () => {
    await determineWater('not_within', null)
    const output = await resolve([], ['applicant'], water)
    expect(withRole(output, 'water_supplier')).toEqual([])
    expect(output.incomplete).toEqual([])
  })

  it('lists the supplier after a within determination', async () => {
    await determineWater('within', 'fernhollow_water')
    const output = await resolve([], ['applicant'], water)
    expect(withRole(output, 'water_supplier').map((r) => r.name)).toEqual([
      'Fernhollow Water District',
    ])
    expect(output.incomplete).toEqual([])
  })

  it('asks for no determination when the notice has no water supplier', async () => {
    const output = await resolve([], ['applicant'])
    expect(output.incomplete).toEqual([])
  })
})

describe('town parties', () => {
  it('lists the planning board and the municipal officers when requested', async () => {
    await saveAndPublish(handle.db, world.admin, 'town_profile', 'default', {
      ...TOWN_PROFILE_SKELETON,
      addressLines: ['2 Common Road', 'Fernhollow, ME 04000'],
    })
    const output = await resolve([], ['planning_board', 'municipal_officers'])
    expect(output.recipients.map((r) => [r.roles, r.mailingAddress])).toEqual([
      [['planning_board'], '2 Common Road, Fernhollow, ME 04000'],
      [['municipal_officers'], '2 Common Road, Fernhollow, ME 04000'],
    ])
    expect(output.incomplete).toEqual([])
  })

  it('reports the missing town office address for each requested party', async () => {
    const output = await resolve([], ['municipal_officers'])
    expect(output.recipients).toEqual([])
    expect(output.incomplete.map((i) => [i.code, i.role])).toEqual([
      ['regional_contacts_missing', 'municipal_officers'],
    ])
  })
})
