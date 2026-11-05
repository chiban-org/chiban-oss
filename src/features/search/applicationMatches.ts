import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, parcels, projects } from '@/db/schema'
import { applicationChipStatus } from '@/features/applications/chipStatus'
import type { CoreState } from '@/features/applications/states'
import { applicationStatusText } from '@/features/applications/statusText'
import { APPLICATIONS_PATH } from '@/features/queue/queueParams'
import { STATUS_TAB_PARAM } from '@/features/queue/stateScopes'
import { typeLabels } from '@/features/queue/workQueue'
import type { SearchScope } from './searchScope'
import { GROUP_LIMIT, joinDetail, likePattern, type SearchGroup } from './searchTypes'

function seeAllHref(query: string): string {
  const params = new URLSearchParams({ q: query, [STATUS_TAB_PARAM]: 'all' })
  return `${APPLICATIONS_PATH}?${params.toString()}`
}

export async function applicationMatches(
  db: DbOrTx,
  scope: SearchScope,
  query: string,
  signal: AbortSignal,
): Promise<SearchGroup> {
  signal.throwIfAborted()
  const pattern = likePattern(query)
  const numberMatch = ilike(applications.number, pattern)
  const rows = await db
    .select({
      id: applications.id,
      number: applications.number,
      state: applications.state,
      substep: applications.substep,
      configPins: applications.configPins,
      siteAddress: parcels.siteAddress,
      byNumber: sql<boolean>`${numberMatch}`,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .innerJoin(parcels, eq(parcels.id, projects.parcelId))
    .where(
      and(
        scope.applications,
        or(
          numberMatch,
          ilike(projects.title, pattern),
          ilike(parcels.siteAddress, pattern),
          ilike(parcels.ownerName, pattern),
        ),
      ),
    )
    .orderBy(desc(numberMatch), desc(applications.seq))
    .limit(GROUP_LIMIT)
  const pinOf = (pins: unknown) => (pins as { applicationType: string }).applicationType
  const labels = await typeLabels(
    db,
    rows.map((r) => pinOf(r.configPins)),
    signal,
  )
  const offerList = scope.applicationList && rows.some((r) => r.byNumber)
  return {
    key: 'applications',
    label: 'Applications',
    seeAll: offerList ? { href: seeAllHref(query), label: 'See all application matches' } : null,
    rows: rows.map((r) => {
      const type = labels.get(pinOf(r.configPins))
      const state = r.state as CoreState
      return {
        key: r.id,
        href: `/staff/applications/${r.id}`,
        title: r.number,
        detail: joinDetail([type?.label, r.siteAddress]),
        chip: {
          status: applicationChipStatus(state),
          label: applicationStatusText(state, r.substep, type?.substeps ?? []),
        },
        newTab: false,
      }
    }),
  }
}
