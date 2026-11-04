import { ActionForm } from '@/components/ActionForm'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { TablePager } from '@/components/dataTable/TablePager'
import { EnforcementQueueTable } from '@/components/enforcement/EnforcementQueueTable'
import { TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import { clearHref, pageHref, type RawSearchParams, readOffset } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { caseListFacets } from '@/features/enforcement/caseList'
import { caseChipGroups } from '@/features/enforcement/caseListChips'
import {
  CASE_FILTER_PARAMS,
  CASE_SORT,
  CASES_PATH,
  readCasesView,
} from '@/features/enforcement/caseListParams'
import { listCaseQueue } from '@/features/enforcement/caseQueue'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { openCaseAction, staffComplaintAction } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

function NewCaseForms() {
  return (
    <>
      <details>
        <summary>Open a case</summary>
        <ActionForm action={openCaseAction} submitLabel="Open case">
          <TextField label="Where is the property?" name="locationText" required />
          <TextField
            label="Parcel number, if known"
            name="parcelRef"
            hint="Without one, Chiban links the parcel whose site address matches exactly."
          />
        </ActionForm>
      </details>
      <details>
        <summary>Enter a complaint taken by phone or at the counter</summary>
        <p>Entering a complaint opens a case for it.</p>
        <ActionForm action={staffComplaintAction} submitLabel="Record complaint">
          <TextField label="Where is the property?" name="locationText" required />
          <TextField label="What was reported?" name="description" required />
          <TextField
            label="Parcel number, if known"
            name="parcelRef"
            hint="Without one, Chiban links the parcel whose site address matches exactly."
          />
        </ActionForm>
      </details>
    </>
  )
}

export default async function EnforcementQueuePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort, filters } = readCasesView(await searchParams)
  const ctx = await requireStaffContext()
  if (!mayOpen(CASES_PATH, await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Code enforcement" action="see code enforcement cases" />
  }
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const [queue, facets, canManage] = await Promise.all([
    listCaseQueue(
      ctx.db,
      ctx.actor,
      { filters, sort, limit: PAGE_SIZE, offset: readOffset(params) },
      today,
      ctx.signal,
    ),
    caseListFacets(ctx.db, ctx.actor, { filters }, today, ctx.signal),
    hasCapability(ctx.db, ctx.actor.userId, 'enforcement.manage', ctx.signal),
  ])
  const links = sortLinks(CASES_PATH, params, CASE_SORT, sort)
  const clear = clearHref(CASES_PATH, params, CASE_FILTER_PARAMS)
  const pageLink = (offset: number | null) =>
    offset === null ? null : pageHref(CASES_PATH, params, String(offset))
  const tableKey = [
    sort.key,
    sort.dir,
    queue.offset,
    ...CASE_FILTER_PARAMS.map((name) => (params.get(name) ?? []).join(',')),
  ].join('|')
  return (
    <main data-wide="">
      <h1>Code enforcement</h1>
      <p>Newest case first. Keys: j and k to move, Enter to open a case.</p>
      <div className="toolbar">
        <QuickFilters
          label="Quick filters"
          groups={caseChipGroups(params, facets)}
          clearHref={clear}
        />
      </div>
      <div className="table-panel">
        <EnforcementQueueTable key={tableKey} rows={queue.rows} links={links} />
      </div>
      <TablePager
        offset={queue.offset}
        shown={queue.rows.length}
        total={queue.total}
        prevHref={pageLink(queue.prevOffset)}
        nextHref={pageLink(queue.nextOffset)}
      />
      {canManage ? <NewCaseForms /> : null}
    </main>
  )
}
