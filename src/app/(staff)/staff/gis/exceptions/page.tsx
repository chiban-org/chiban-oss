import { inArray } from 'drizzle-orm'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortBar } from '@/components/dataTable/SortHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { importRuns } from '@/db/schema'
import { hasCapability } from '@/features/authz/capabilities'
import { clearHref, type RawSearchParams } from '@/features/dataTable/params'
import { chipGroups, filterTabs, labeledOptions } from '@/features/dataTable/quickFilters'
import { sortLinks } from '@/features/dataTable/sort'
import { EXCEPTION_KIND_LABELS, EXCEPTION_STATUS_LABELS } from '@/features/gis/exceptionLabels'
import {
  DEFAULT_EXCEPTION_STATUS,
  EXCEPTION_SORT,
  EXCEPTION_SORT_LABELS,
  EXCEPTIONS_PATH,
  type ExceptionView,
  readExceptionView,
} from '@/features/gis/exceptionSort'
import { exceptionFacets, listExceptions } from '@/features/gis/exceptionsList'
import { townTimeZone } from '@/features/town/timeZone'
import { recordStaffContext } from '@/server/requireStaff'
import { ExceptionRow } from './ExceptionRow'
import { HeldRunAccept } from './HeldRunAccept'

interface ExceptionsPageProps {
  searchParams: Promise<RawSearchParams>
}

type Facets = Awaited<ReturnType<typeof exceptionFacets>>

function filterViews(view: ExceptionView, facets: Facets) {
  const tabs = filterTabs(EXCEPTIONS_PATH, view.params, {
    param: 'status',
    label: 'Status',
    options: labeledOptions(EXCEPTION_STATUS_LABELS, facets.status),
    defaultTab: DEFAULT_EXCEPTION_STATUS,
  })
  const chips = chipGroups(EXCEPTIONS_PATH, view.params, [
    {
      param: 'kind',
      label: 'Kind',
      options: labeledOptions(EXCEPTION_KIND_LABELS, facets.kind),
      display: 'menu',
      single: true,
    },
  ])
  const links = sortLinks(EXCEPTIONS_PATH, view.params, EXCEPTION_SORT, view.sort)
  const sortOptions = (Object.keys(EXCEPTION_SORT_LABELS) as (keyof typeof links)[]).map((key) => ({
    label: EXCEPTION_SORT_LABELS[key],
    link: links[key],
  }))
  return { tabs, chips, sortOptions, clear: clearHref(EXCEPTIONS_PATH, view.params, ['kind']) }
}

export default async function StaffExceptionsPage({ searchParams }: ExceptionsPageProps) {
  const view = readExceptionView(await searchParams)
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Import exceptions" action="see import exceptions" />
  const [kind] = view.kind
  const [rows, facets, canManage, timeZone] = await Promise.all([
    listExceptions(
      ctx.db,
      { status: view.status, sort: view.sort, ...(kind === undefined ? {} : { kind }) },
      ctx.signal,
    ),
    exceptionFacets(ctx.db, view, ctx.signal),
    hasCapability(ctx.db, ctx.actor.userId, 'parcel.manage', ctx.signal),
    townTimeZone(ctx.db, ctx.signal),
  ])
  const held = rows.filter((r) => r.kind === 'owner_changed' && r.status === 'open')
  const heldRunIds = canManage ? [...new Set(held.map((r) => r.lastSeenRunId))] : []
  const heldRuns =
    heldRunIds.length === 0
      ? []
      : await ctx.db.select().from(importRuns).where(inArray(importRuns.id, heldRunIds))
  const { tabs, chips, sortOptions, clear } = filterViews(view, facets)
  return (
    <main data-wide="">
      <h1>Import exceptions</h1>
      <p>Rows an import could not apply on its own. Newest first.</p>
      <FilterTabs label="Status" tabs={tabs} />
      <div className="toolbar flex flex-wrap items-center justify-between gap-3">
        <QuickFilters label="Quick filters" groups={chips} clearHref={clear} />
        <SortBar options={sortOptions} />
      </div>
      {heldRuns.map((run) => (
        <HeldRunAccept
          key={run.id}
          run={run}
          held={held.filter((r) => r.lastSeenRunId === run.id).length}
          timeZone={timeZone}
        />
      ))}
      {rows.length === 0 ? (
        <p>No exceptions match. Pick another status or kind.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <ExceptionRow key={row.id} row={row} timeZone={timeZone} canManage={canManage} />
          ))}
        </ul>
      )}
    </main>
  )
}
