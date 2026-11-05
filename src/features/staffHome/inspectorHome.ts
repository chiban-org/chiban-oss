import type { EnforcementStatus } from '@/db/schema'
import { caseListFacets } from '@/features/enforcement/caseList'
import {
  countRequestedInspections,
  countStopsOn,
  listMissingResults,
  upcomingInspectionDays,
} from '@/features/inspections/inspectorWork'
import type { HomeContext, HomeRow, HomeSection } from '@/features/staffHome/homeTypes'
import { mayOpen } from '@/features/staffNav/navItems'

const DAY = '/staff/inspections/day'
const NEXT_DAYS = 3
const OPEN_CASES: EnforcementStatus[] = [
  'intake',
  'investigating',
  'violation_found',
  'order_issued',
  'in_court',
]
const MY_CASES = `/staff/enforcement?assigned=me&${OPEN_CASES.map((s) => `status=${s}`).join('&')}`

async function myOpenCases(ctx: HomeContext): Promise<number | null> {
  if (!mayOpen('/staff/enforcement', ctx.viewer)) return null
  const facets = await caseListFacets(
    ctx.db,
    ctx.actor,
    { filters: { statuses: OPEN_CASES } },
    ctx.today,
    ctx.signal,
  )
  return facets.assigned.get('me') ?? 0
}

async function requests(ctx: HomeContext): Promise<number | null> {
  if (!mayOpen('/staff/inspections', ctx.viewer)) return null
  return await countRequestedInspections(ctx.db, ctx.actor, ctx.signal)
}

function row(label: string, count: number | null, href: string): HomeRow[] {
  return count === null ? [] : [{ label, count, href }]
}

export async function loadInspectorSection(ctx: HomeContext): Promise<HomeSection | null> {
  if (!mayOpen(DAY, ctx.viewer)) return null
  const day = { inspectorUserId: ctx.actor.userId, date: ctx.today }
  const [missing, stops, requested, cases, days] = await Promise.all([
    listMissingResults(ctx.db, ctx.actor, { ...day, today: ctx.today, limit: 1 }, ctx.signal),
    countStopsOn(ctx.db, ctx.actor, day, ctx.signal),
    requests(ctx),
    myOpenCases(ctx),
    upcomingInspectionDays(ctx.db, ctx.actor, { ...day, limit: NEXT_DAYS }, ctx.signal),
  ])
  const missingCount = missing.ok ? missing.value.total : 0
  return {
    role: 'inspector',
    title: 'Inspections',
    urgency: missingCount,
    rows: [
      ...row('Still need a result', missingCount, `${DAY}#missing-results`),
      ...row("Stops on today's route", stops, DAY),
      ...row('Requests to schedule', requested, '/staff/inspections'),
      ...row('Your open enforcement cases', cases, MY_CASES),
    ],
    links: [{ label: 'Open My day', href: DAY }],
    detail: {
      kind: 'days',
      days: days.map((d) => ({
        ...d,
        href: `${DAY}?date=${d.date}&inspector=${ctx.actor.userId}`,
      })),
    },
  }
}
