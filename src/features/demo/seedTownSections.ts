import { eq } from 'drizzle-orm'
import { applicationConditions, applications } from '@/db/schema'
import type { EnforcementSeedContext } from '@/features/demo/seedEnforcementSupport'
import { must } from '@/features/demo/seedPermitSupport'
import { addTownSection, type TownSectionInput } from '@/features/enforcement/sections/townSections'

const zoning = (reference: string, title: string): TownSectionInput => ({
  provisionKind: 'zoning_ordinance',
  reference: `Zoning Ordinance ${reference}`,
  title,
})

export const DEMO_TOWN_SECTIONS: readonly TownSectionInput[] = [
  zoning('Section 4.2', 'accessory structure setbacks'),
  zoning('Section 6.1', 'uses allowed in the district'),
  zoning('Section 7.3', 'home occupations'),
  zoning('Section 4.4', 'height of fences and walls'),
  zoning('Section 5.2', 'Alder Pond shorefront buffer'),
  zoning('Section 8.1', 'signs'),
  zoning('Section 9.3', 'off-street parking'),
  {
    provisionKind: 'other_local_ordinance',
    reference: 'Alder Pond Driveway Ordinance Section 3',
    title: 'driveway permits',
  },
  {
    provisionKind: 'other_local_ordinance',
    reference: 'Alder Pond Junk Ordinance Section 2',
    title: 'unregistered vehicles and junk',
  },
]

export async function seedTownSections(ctx: EnforcementSeedContext): Promise<void> {
  for (const section of DEMO_TOWN_SECTIONS) {
    must(await addTownSection(ctx.db, ctx.admin, section, ctx.signal), 'town section')
  }
}

const CASE_PARCEL_PERMIT = 'EL-2026-0005'

const PERMIT_CONDITIONS = [
  { code: '1', text: 'Put the garage receptacles on a ground fault protected circuit.' },
  {
    code: '2',
    text: 'Call for the final electrical inspection before the garage is used as a shop.',
  },
]

export async function seedCaseParcelConditions(ctx: EnforcementSeedContext): Promise<void> {
  const [permit] = await ctx.db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.number, CASE_PARCEL_PERMIT))
  if (permit === undefined) return
  await ctx.db.insert(applicationConditions).values(
    PERMIT_CONDITIONS.map((c) => ({
      applicationId: permit.id,
      code: c.code,
      textSnapshot: c.text,
      blocksIssuance: false,
      status: 'met' as const,
      changedBy: ctx.staff.userId,
    })),
  )
}
