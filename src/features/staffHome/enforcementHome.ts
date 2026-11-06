import type { EnforcementStatus } from '@/db/schema'
import { tableHref } from '@/features/dataTable/params'
import { caseListFacets } from '@/features/enforcement/caseList'
import { CASES_PATH } from '@/features/enforcement/caseListParams'
import type { AssignedFilter, DueFilter } from '@/features/queue/queueParams'
import type { HomeContext, HomeSection } from '@/features/staffHome/homeTypes'

const OPEN_CASES: EnforcementStatus[] = [
  'intake',
  'investigating',
  'violation_found',
  'order_issued',
  'in_court',
]

function openCasesHref(filter: { due: DueFilter } | { assigned: AssignedFilter }): string {
  return tableHref(CASES_PATH, new Map([['status', OPEN_CASES]]), filter)
}

export async function loadEnforcementSection(ctx: HomeContext): Promise<HomeSection | null> {
  if (!ctx.viewer.capabilities.has('enforcement.manage')) return null
  const facets = await caseListFacets(
    ctx.db,
    ctx.actor,
    { filters: { statuses: OPEN_CASES } },
    ctx.today,
    ctx.signal,
  )
  const overdue = facets.due.get('overdue') ?? 0
  return {
    key: 'enforcement',
    title: 'Enforcement',
    urgency: overdue,
    rows: [
      {
        label: 'Open cases past a deadline',
        count: overdue,
        href: openCasesHref({ due: 'overdue' }),
      },
      {
        label: 'Open cases assigned to you',
        count: facets.assigned.get('me') ?? 0,
        href: openCasesHref({ assigned: 'me' }),
      },
      {
        label: 'Open cases with no one assigned',
        count: facets.assigned.get('none') ?? 0,
        href: openCasesHref({ assigned: 'none' }),
      },
    ],
    links: [{ label: 'Open enforcement', href: CASES_PATH }],
    detail: null,
  }
}
