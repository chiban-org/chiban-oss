import { NH_CLASSIFICATIONS } from '@packs/nh/classifications'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applications,
  parcelAliases,
  parcels,
  projectParties,
  projects,
  restrictionHoldings,
} from '@/db/schema'
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
      state: 'fresh',
      ageDays: 23,
    })
    await handle.db.update(restrictionHoldings).set({ checkedOn: '2025-06-01' })
    const due = await resolve([])
    expect(due.incomplete.map((i) => i.code)).not.toContain('roster_never_reviewed')
    expect(
      due.recipients.find((r) => r.roles[0] === 'restriction_holder')?.provenance[0],
    ).toMatchObject({ state: 'stale' })
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
