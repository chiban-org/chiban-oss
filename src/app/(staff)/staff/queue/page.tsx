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
import { carriedParams, queueChipGroups } from '@/features/queue/queueChips'
import { queueFacets } from '@/features/queue/queueFacets'
import {
  activeFilterLabels,
  filterKey,
  QUEUE_FILTER_PARAMS,
  QUEUE_PATH,
  QUEUE_SORT,
  readQueueView,
} from '@/features/queue/queueParams'
import { listWorkQueue } from '@/features/queue/workQueue'
import { listReviewerChoices } from '@/features/reviews/reviewerView'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { requireStaffContext } from '@/server/requireStaff'
import { assignReviewerAction } from '../reviews/actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort, filters } = readQueueView(await searchParams)
  const ctx = await requireStaffContext()
  if (!mayOpen(QUEUE_PATH, await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Work queue" action="see the work queue" />
  }
  const cursor = firstParam(params, PAGE_PARAM)
  const [queue, facets] = await Promise.all([
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
  return (
    <main>
      <h1>Work queue</h1>
      <QueueSummary total={queue.total} filters={labels} />
      <KeyHints canAssign={reviewers.length > 0} />
      <QueueFilters
        search={firstParam(params, 'q') ?? ''}
        state={firstParam(params, 'state') ?? ''}
        carried={carriedParams(params)}
        chips={queueChipGroups(params, facets, hasFullRecordAccess(ctx.actor))}
        clearHref={clearHref(QUEUE_PATH, params, QUEUE_FILTER_PARAMS)}
      />
      <QueueTable
        key={filterKey(params)}
        rows={queue.rows}
        reviewers={reviewers}
        assign={assignReviewerAction}
        sort={sortLinks(QUEUE_PATH, params, QUEUE_SORT, sort)}
        empty={<NoMatches filters={labels} />}
      />
      <TablePager
        offset={queue.offset}
        shown={queue.rows.length}
        total={queue.total}
        prevHref={queue.prevCursor === null ? null : pageHref(QUEUE_PATH, params, queue.prevCursor)}
        nextHref={queue.nextCursor === null ? null : pageHref(QUEUE_PATH, params, queue.nextCursor)}
      />
    </main>
  )
}
