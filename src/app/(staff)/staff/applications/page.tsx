import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { TablePager } from '@/components/dataTable/TablePager'
import { QueueFilters } from '@/components/queue/QueueFilters'
import { KeyHints, NoMatches, QueueSummary } from '@/components/queue/QueueSummary'
import { QueueTable } from '@/components/queue/QueueTable'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasFullRecordAccess } from '@/features/access/roles'
import { hasCapability } from '@/features/authz/capabilities'
import {
  clearHref,
  firstParam,
  PAGE_PARAM,
  pageHref,
  type RawSearchParams,
} from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { carriedParams, queueChipGroups, statusTabs } from '@/features/queue/queueChips'
import { queueFacets } from '@/features/queue/queueFacets'
import {
  APPLICATIONS_PATH,
  activeFilterLabels,
  filterKey,
  QUEUE_FILTER_PARAMS,
  QUEUE_SORT,
  readQueueView,
} from '@/features/queue/queueParams'
import { readStatusTab, type StatusTab } from '@/features/queue/stateScopes'
import { listWorkQueue } from '@/features/queue/workQueue'
import { listReviewerChoices } from '@/features/reviews/reviewerView'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { requireStaffContext } from '@/server/requireStaff'
import { assignReviewerAction } from '../reviews/actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

const EMPTY_TAB: Readonly<Record<StatusTab, string>> = {
  action: 'Nothing needs action right now.',
  open: 'No open applications.',
  issued: 'No issued or suspended permits.',
  finished: 'No closed, denied, withdrawn or expired applications.',
  all: 'No applications yet.',
}

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort, filters } = readQueueView(await searchParams)
  const ctx = await requireStaffContext()
  if (!mayOpen(APPLICATIONS_PATH, await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Applications" action="see applications" />
  }
  const cursor = firstParam(params, PAGE_PARAM)
  const [page, facets] = await Promise.all([
    listWorkQueue(
      ctx.db,
      ctx.actor,
      { filters, sort, limit: PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
      ctx.signal,
    ),
    queueFacets(ctx.db, ctx.actor, { filters }, ctx.signal),
  ])
  const canAssign = await hasCapability(ctx.db, ctx.actor.userId, 'review.assign', ctx.signal)
  const reviewers = canAssign ? await listReviewerChoices(ctx.db) : []
  const labels = activeFilterLabels(params, new Map(facets.types.map((t) => [t.value, t.label])))
  const clear = clearHref(APPLICATIONS_PATH, params, QUEUE_FILTER_PARAMS)
  return (
    <main data-wide="">
      <h1>Applications</h1>
      <p className="mb-5">
        Needs action lists applications that are submitted or under review, and any other with a
        deadline running or overdue, soonest due first. The other tabs show the rest, drafts
        included.
      </p>
      <FilterTabs label="Status" tabs={statusTabs(params, facets)} />
      <QueueFilters
        search={firstParam(params, 'q') ?? ''}
        carried={carriedParams(params)}
        chips={queueChipGroups(params, facets, hasFullRecordAccess(ctx.actor))}
        clearHref={clear}
      />
      <QueueSummary total={page.total} filters={labels} />
      <KeyHints canAssign={reviewers.length > 0} />
      <QueueTable
        key={filterKey(params)}
        rows={page.rows}
        reviewers={reviewers}
        assign={assignReviewerAction}
        sort={sortLinks(APPLICATIONS_PATH, params, QUEUE_SORT, sort)}
        empty={
          <NoMatches
            filters={labels}
            clearHref={clear}
            emptyText={EMPTY_TAB[readStatusTab(params)]}
          />
        }
      />
      <TablePager
        offset={page.offset}
        shown={page.rows.length}
        total={page.total}
        prevHref={
          page.prevCursor === null ? null : pageHref(APPLICATIONS_PATH, params, page.prevCursor)
        }
        nextHref={
          page.nextCursor === null ? null : pageHref(APPLICATIONS_PATH, params, page.nextCursor)
        }
      />
    </main>
  )
}
