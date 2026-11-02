import { and, asc, between, eq, isNotNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, censusClassifications, parcels, projects } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { CENSUS_CLASSIFICATION } from '@/features/census/classify'
import { toCsvRows } from '@/features/reports/csv'
import { getTownSettings } from '@/features/town/settings'
import { err, ok, type Result } from '@/types/result'

const LARGE_PERMIT_DOLLARS = 1_000_000

export const CENSUS_ITEMS = [
  { code: '101', category: 'single_family', label: 'Single-family houses, detached and attached' },
  { code: '103', category: 'two_unit', label: 'Two-unit buildings' },
  { code: '104', category: 'three_four_unit', label: 'Three- and four-unit buildings' },
  { code: '105', category: 'five_plus_unit', label: 'Buildings with five or more units' },
] as const

export interface CensusLargePermit {
  number: string
  description: string
  siteAddress: string
  ownerOrBuilder: string
  buildings: number
  housingUnits: number
  valuationDollars: number
}

export interface CensusReport {
  period: string
  townName: string
  items: {
    code: '101' | '103' | '104' | '105'
    label: string
    buildings: number
    housingUnits: number
    valuationDollars: number
  }[]
  largePermits: CensusLargePermit[]
  noPermits: boolean
  needsClassification: { applicationId: string; number: string }[]
  complete: boolean
}

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'long',
})

function rangeOf(year: number, month: number | null): { from: string; to: string; label: string } {
  if (month === null) return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) }
  const mm = String(month).padStart(2, '0')
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(last).padStart(2, '0')}`,
    label: MONTH_FORMAT.format(new Date(Date.UTC(year, month - 1, 1))),
  }
}

export async function censusBpsReport(
  db: Db,
  actor: Actor,
  input: { year: number; month: number | null },
  signal: AbortSignal,
): Promise<Result<CensusReport, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'report.view', signal)
  if (!allowed.ok) return err('forbidden')
  const range = rangeOf(input.year, input.month)
  const town = await getTownSettings(db, signal)
  const issued = await db
    .select({
      id: applications.id,
      number: applications.number,
      values: applications.values,
      siteAddress: parcels.siteAddress,
      ownerName: parcels.ownerName,
      classification: censusClassifications,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .innerJoin(parcels, eq(parcels.id, projects.parcelId))
    .leftJoin(censusClassifications, eq(censusClassifications.applicationId, applications.id))
    .where(
      and(isNotNull(applications.issuedOn), between(applications.issuedOn, range.from, range.to)),
    )
    .orderBy(asc(applications.issuedOn), asc(applications.number))
  const items = CENSUS_ITEMS.map((i) => ({
    code: i.code,
    label: i.label,
    buildings: 0,
    housingUnits: 0,
    valuationDollars: 0,
  }))
  const largePermits: CensusLargePermit[] = []
  const needsClassification: CensusReport['needsClassification'] = []
  let building = 0
  for (const row of issued) {
    const context = await loadApplicationContext(db, row.id, signal)
    if (context?.typeBody.classification !== CENSUS_CLASSIFICATION) continue
    building += 1
    const c = row.classification
    if (c === null) {
      needsClassification.push({ applicationId: row.id, number: row.number })
      continue
    }
    const target = items.find(
      (i) => CENSUS_ITEMS.find((x) => x.code === i.code)?.category === c.category,
    )
    if (target === undefined) continue
    target.buildings += c.buildings
    target.housingUnits += c.housingUnits
    target.valuationDollars += c.valuationDollars
    if (c.valuationDollars >= LARGE_PERMIT_DOLLARS) {
      const description = (row.values as Record<string, unknown>).description
      largePermits.push({
        number: row.number,
        description: typeof description === 'string' ? description : '',
        siteAddress: row.siteAddress ?? '',
        ownerOrBuilder: row.ownerName ?? '',
        buildings: c.buildings,
        housingUnits: c.housingUnits,
        valuationDollars: c.valuationDollars,
      })
    }
  }
  return ok({
    period: range.label,
    townName: town.ok ? town.value.name : '',
    items,
    largePermits,
    noPermits: building === 0,
    needsClassification,
    complete: needsClassification.length === 0,
  })
}

export function censusCsv(report: CensusReport): string {
  return toCsvRows([
    ['Item', 'Type of structure', 'Buildings', 'Housing units', 'Valuation'],
    ...report.items.map((i) => [
      i.code,
      i.label,
      String(i.buildings),
      String(i.housingUnits),
      String(i.valuationDollars),
    ]),
    [''],
    [
      'Number',
      'Description',
      'Site address',
      'Owner or builder',
      'Buildings',
      'Housing units',
      'Valuation',
    ],
    ...report.largePermits.map((p) => [
      p.number,
      p.description,
      p.siteAddress,
      p.ownerOrBuilder,
      String(p.buildings),
      String(p.housingUnits),
      String(p.valuationDollars),
    ]),
  ])
}
