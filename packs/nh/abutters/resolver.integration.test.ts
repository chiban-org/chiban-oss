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

describe('other roles', () => {
  it('zba list has no sealed_professional', async () => {
    await addProfessional(
      handle.db,
      world.staff,
      {
        applicationId,
        name: 'Rae Fenn',
        profession: 'land_surveyor',
        businessAddress: '8 Survey Row',
        sealOnPlat: true,
      },
      signal,
    )
    expect((await resolve([], 'nh.pb_site_plan')).recipients.map((r) => r.roles[0])).toContain(
      'sealed_professional',
    )
    expect((await resolve([], 'nh.zba_variance')).recipients.map((r) => r.roles[0])).not.toContain(
      'sealed_professional',
    )
  })

  it('a professional whose seal is not on the plat is not a recipient', async () => {
    await addProfessional(
      handle.db,
      world.staff,
      {
        applicationId,
        name: 'Rae Fenn',
        profession: 'engineer',
        businessAddress: '8 Survey Row',
        sealOnPlat: false,
      },
      signal,
    )
    expect((await resolve([])).recipients.map((r) => r.roles[0])).not.toContain(
      'sealed_professional',
    )
  })

  it('restriction holders come from active holdings and need a reviewed roster', async () => {
    const [applicantParcel] = await handle.db.query.applicationParcels.findMany()
    await addRestriction(
      handle.db,
      world.staff,
      {
        parcelId: applicantParcel?.parcelId ?? '',
        holderName: 'Alder Valley Land Trust',
        holderMailingAddress: '2 Trust Lane, Alder Pond NH',
        restrictionKind: 'conservation',
        recordedReference: 'Book 12, Page 40',
      },
      signal,
    )
    await handle.db.execute(sql`delete from roster_reviews`)
    const unreviewed = await resolve([])
    expect(unreviewed.recipients.map((r) => r.name)).toContain('Alder Valley Land Trust')
    expect(unreviewed.incomplete.map((i) => i.code)).toContain('roster_never_reviewed')
    await recordRosterReview(
      handle.db,
      world.staff,
      { kind: 'restrictions', reviewedOn: d('2027-03-01') },
      signal,
    )
    const reviewed = await resolve([])
    expect(reviewed.incomplete.map((i) => i.code)).not.toContain('roster_never_reviewed')
    expect(
      reviewed.recipients.find((r) => r.roles[0] === 'restriction_holder')?.provenance[0],
    ).toMatchObject({
      state: 'reviewed',
      ageDays: 23,
    })
  })

  it('regional impact yes adds the commission and Pine River and Dunmore municipalities with certified hints', async () => {
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId, determination: 'yes', municipalityKeys: ['pine_river', 'dunmore'] },
      signal,
      NOW,
    )
    const output = await resolve([])
    const regional = output.recipients.filter((r) =>
      r.roles.some(
        (role) => role === 'regional_planning_commission' || role === 'affected_municipality',
      ),
    )
    expect(regional.map((r) => r.name)).toEqual([
      'Alder Valley Regional Planning Commission',
      'Town of Pine River',
      'Town of Dunmore',
    ])
    expect(regional.every((r) => r.channelHint === 'certified_mail')).toBe(true)
  })

  it('a missing determination is determination_missing', async () => {
    await handle.db.execute(sql`delete from regional_impact_determinations`)
    await handle.db.execute(sql`delete from des_proximity_determinations`)
    const output = await resolve([])
    expect(output.incomplete.map((i) => i.code)).toEqual(
      expect.arrayContaining(['determination_missing']),
    )
  })

  it('a missing commission contact is regional_contacts_missing', async () => {
    await recordBoardRegionalImpact(
      handle.db,
      world.staff,
      { applicationId, determination: 'yes', municipalityKeys: ['dunmore'] },
      signal,
      NOW,
    )
    await handle.db.execute(sql`delete from config_versions where kind = 'regional_contacts'`)
    expect((await resolve([])).incomplete.map((i) => i.code)).toContain('regional_contacts_missing')
  })

  it('des within adds NH DES with a first class hint', async () => {
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
    expect((await resolve([])).recipients.map((r) => r.roles[0])).not.toContain('nh_des')
    await recordDesDetermination(
      handle.db,
      world.staff,
      {
        applicationId,
        determination: 'within_500ft',
        reason: 'The pond is 300 feet from the site',
      },
      signal,
      NOW,
    )
    const des = (await resolve([])).recipients.find((r) => r.roles[0] === 'nh_des')
    expect(des).toMatchObject({
      name: 'NH Department of Environmental Services',
      channelHint: 'first_class_mail',
    })
  })
})
