import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applications, parcelAliases, parcels, projectParties, projects } from '@/db/schema'
import { type ResolverOutput, recipientResolver } from '@/features/abutters/resolution'
import { recordDesDetermination } from '@/features/boards/des500'
import { recordBoardRegionalImpact } from '@/features/boards/regionalImpact'
import { upsertAssociation } from '@/features/rosters/associations'
import { upsertPark } from '@/features/rosters/parks'
import { addProfessional } from '@/features/rosters/professionals'
import { addRestriction } from '@/features/rosters/restrictions'
import { recordRosterReview } from '@/features/rosters/reviews'
import { importScenario } from '@/test/abutterWorld'
import {
  type BoardWorld,
  publishRegionalContacts,
  setupBoardWorld,
  submitBoardApplication,
} from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import type { CivilDate } from '@/types/civilDate'
import './resolver'

const signal = new AbortController().signal
const NOW = new Date('2027-03-24T16:00:00Z')
const d = (s: string) => s as CivilDate
let handle: TestDb
let world: BoardWorld
let ids: Record<string, string>
let applicationId: string

beforeEach(async () => {
  handle = await makeTestDb()
  world = await setupBoardWorld(handle.db)
  await publishRegionalContacts(handle.db, world)
  ids = await importScenario(handle.db, world.staff)
  applicationId = await submitBoardApplication(handle.db, world, world.pbTypeKey, '2027-03-24')
  await handle.db
    .update(applications)
    .set({ values: { applicant_mailing_address: '12 Osprey Lane, Alder Pond NH 03999' } })
    .where(eq(applications.id, applicationId))
  await recordRosterReview(
    handle.db,
    world.staff,
    { kind: 'restrictions', reviewedOn: d('2027-03-01') },
    signal,
  )
  await recordBoardRegionalImpact(
    handle.db,
    world.staff,
    { applicationId, determination: 'no', municipalityKeys: [] },
    signal,
    NOW,
  )
  await recordDesDetermination(
    handle.db,
    world.staff,
    {
      applicationId,
      determination: 'not_applicable',
      reason: 'No water body near the building site',
    },
    signal,
    NOW,
  )
})
afterEach(async () => {
  await handle.drop()
})

const classification = (key: string) => {
  const spec = NH_CLASSIFICATIONS.find((c) => c.key === key)?.abutters
  if (spec === null || spec === undefined) throw new Error(`no abutters spec for ${key}`)
  return spec
}

async function resolve(
  names: string[],
  key = 'nh.pb_site_plan',
  now = NOW,
): Promise<ResolverOutput> {
  const spec = classification(key)
  return await handle.db.transaction((tx) =>
    recipientResolver(spec.resolverKey).resolve(
      tx,
      {
        applicationId,
        candidates: names.map((n) => ({
          parcelId: ids[n] ?? '',
          reasons: [{ kind: 'adjacent' as const }],
        })),
        roles: spec.roles,
        conditionalRoles: spec.conditionalRoles,
        now,
      },
      signal,
    ),
  )
}

const owners = (output: ResolverOutput) =>
  output.recipients.filter((r) => r.roles.includes('abutter_owner'))
const withoutApplicant = (output: ResolverOutput) =>
  output.recipients.filter((r) => !r.roles.includes('applicant'))

describe('owners', () => {
  it('resolves an owner and mailing address with parcel provenance', async () => {
    const output = await resolve(['SW'])
    const owner = owners(output)[0]
    expect(owner).toMatchObject({
      name: 'Wren, Isolde',
      mailingAddress: 'PO Box 302, Alder Pond NH 03999',
      channelHint: 'verified_mail',
      status: 'ok',
    })
    expect(owner?.provenance[0]).toMatchObject({
      source: 'parcel_record',
      asOf: '2027-03-01',
      ageDays: 23,
      state: 'fresh',
    })
    expect(output.incomplete).toEqual([])
  })

  it('owner without mailing address is incomplete_data', async () => {
    await handle.db
      .update(parcels)
      .set({ mailingAddress: null })
      .where(eq(parcels.id, ids.SW ?? ''))
    const output = await resolve(['SW'])
    expect(owners(output)[0]?.status).toBe('incomplete_data')
    expect(output.incomplete).toMatchObject([{ code: 'address_missing', parcelId: ids.SW }])
  })

  it('owner name missing is owner_missing', async () => {
    await handle.db
      .update(parcels)
      .set({ ownerName: null })
      .where(eq(parcels.id, ids.SW ?? ''))
    expect((await resolve(['SW'])).incomplete.map((i) => i.code)).toEqual(['owner_missing'])
  })

  it('stale parcel layer marks provenance stale with its age', async () => {
    await handle.db.execute(
      sql`update gis_layers set last_success_at = '2026-10-01T15:00:00Z' where key = 'parcels'`,
    )
    const owner = owners(await resolve(['SW']))[0]
    expect(owner?.provenance[0]).toMatchObject({ state: 'stale', asOf: '2026-10-01', ageDays: 174 })
  })

  it('same owner on two abutting parcels is one recipient with two provenance entries', async () => {
    await handle.db
      .update(parcels)
      .set({ ownerName: 'WREN, ISOLDE', mailingAddress: 'PO Box 302, Alder Pond NH 03999.' })
      .where(eq(parcels.id, ids.SE ?? ''))
    const output = await resolve(['SW', 'SE'])
    expect(owners(output)).toHaveLength(1)
    expect(owners(output)[0]?.provenance).toHaveLength(2)
    expect(owners(output)[0]?.parcelIds.sort()).toEqual([ids.SE, ids.SW].sort())
  })

  it('applicant who owns an abutting parcel merges into one recipient with roles applicant and abutter_owner', async () => {
    const [project] = await handle.db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(applications, eq(applications.projectId, projects.id))
      .where(eq(applications.id, applicationId))
    await handle.db.delete(projectParties).where(eq(projectParties.projectId, project?.id ?? ''))
    await handle.db.insert(projectParties).values({
      projectId: project?.id ?? '',
      name: 'Wren, Isolde',
      role: 'applicant',
      addedBy: world.staff.userId,
    })
    await handle.db
      .update(applications)
      .set({ values: { applicant_mailing_address: 'PO Box 302, Alder Pond NH 03999' } })
      .where(eq(applications.id, applicationId))
    const output = await resolve(['SW'])
    const merged = output.recipients.filter((r) => r.roles.includes('applicant'))
    expect(merged).toHaveLength(1)
    expect(merged[0]?.roles.sort()).toEqual(['abutter_owner', 'applicant'])
    expect(output.recipients).toHaveLength(1)
  })
})

describe('condominiums and parks', () => {
  async function makeCondo(name: string) {
    await handle.db.insert(parcelAliases).values({
      parcelId: ids[name] ?? '',
      format: 'cama15',
      value: '009002000002',
      valueNormalized: '009002000002',
      status: 'active',
      source: 'manual',
    })
  }

  it('condo parcel without roster is incomplete', async () => {
    await makeCondo('SW')
    const output = await resolve(['SW'])
    expect(withoutApplicant(output)).toEqual([])
    expect(output.incomplete).toMatchObject([{ code: 'condo_roster_missing', parcelId: ids.SW }])
  })

  it('condo parcel with roster yields its two officers and not unit owners', async () => {
    await makeCondo('SW')
    await upsertAssociation(
      handle.db,
      world.staff,
      {
        parcelId: ids.SW ?? '',
        associationName: 'Pond View Condominium',
        officers: [
          {
            name: 'Dana Whitcomb',
            title: 'President',
            mailingAddress: 'PO Box 105, Alder Pond NH',
          },
          { name: 'Lee Marsh', title: 'Treasurer', mailingAddress: 'PO Box 106, Alder Pond NH' },
        ],
        asOf: d('2027-02-01'),
      },
      signal,
    )
    const output = await resolve(['SW'])
    expect(withoutApplicant(output).map((r) => r.name)).toEqual(['Dana Whitcomb', 'Lee Marsh'])
    expect(withoutApplicant(output).every((r) => r.roles[0] === 'condo_association_officer')).toBe(
      true,
    )
    expect(withoutApplicant(output)[0]?.provenance[0]).toMatchObject({
      source: 'association_roster',
      asOf: '2027-02-01',
      ageDays: 51,
    })
    expect(output.incomplete).toEqual([])
  })

  it('park parcel yields the park owner and needs_decision tenants', async () => {
    await upsertPark(
      handle.db,
      world.staff,
      {
        parcelId: ids.SW ?? '',
        parkName: 'Heron Park',
        ownerName: 'Heron Park LLC',
        ownerMailingAddress: '1 Heron Road, Alder Pond NH',
        tenants: [
          {
            tenantId: 's4',
            name: 'Lee Marsh',
            mailingAddress: '4 Heron Road',
            siteLabel: 'Site 4',
          },
          {
            tenantId: 's5',
            name: 'Cass Pryor',
            mailingAddress: '5 Heron Road',
            siteLabel: 'Site 5',
          },
        ],
        asOf: d('2027-02-01'),
      },
      signal,
    )
    const output = await resolve(['SW'])
    expect(withoutApplicant(output).map((r) => [r.name, r.roles[0], r.status])).toEqual([
      ['Heron Park LLC', 'mhp_owner', 'ok'],
      ['Lee Marsh', 'mhp_tenant', 'needs_decision'],
      ['Cass Pryor', 'mhp_tenant', 'needs_decision'],
    ])
  })
})
