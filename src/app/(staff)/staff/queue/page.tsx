import { QueueFilters } from '@/components/queue/QueueFilters'
import { KeyHints, NoMatches, QueuePager, QueueSummary } from '@/components/queue/QueueSummary'
import { QueueTable } from '@/components/queue/QueueTable'
import { NoPermission } from '@/components/staff/NoPermission'
import { hasCapability } from '@/features/authz/capabilities'
import {
  activeFilterLabels,
  filterKey,
  type QueueSearchParams,
  queueHref,
} from '@/features/queue/queueParams'
import { statesForParam } from '@/features/queue/stateScopes'
import { listWorkQueue } from '@/features/queue/workQueue'
import { listReviewerChoices } from '@/features/reviews/reviewerView'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { requireStaffContext } from '@/server/requireStaff'
import { assignReviewerAction } from '../reviews/actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

function present(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<QueueSearchParams>
}) {
  const params = await searchParams
  const ctx = await requireStaffContext()
  if (!mayOpen('/staff/queue', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Work queue" action="see the work queue" />
  }
  const states = statesForParam(params.state)
  const queue = await listWorkQueue(
    ctx.db,
    ctx.actor,
    {
      filters: {
        ...(states === undefined ? {} : { states }),
        ...(present(params.q) ? { numberContains: params.q } : {}),
        assignedToMe: params.mine === '1',
        overdueOnly: params.overdue === '1',
        awaitingPayment: params.unpaid === '1',
      },
      limit: PAGE_SIZE,
      ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
    },
    ctx.signal,
  )
  const canAssign = await hasCapability(ctx.db, ctx.actor.userId, 'review.assign', ctx.signal)
  const reviewers = canAssign ? await listReviewerChoices(ctx.db) : []
  const filters = activeFilterLabels(params)
  return (
    <main>
      <h1>Work queue</h1>
      <QueueSummary total={queue.total} filters={filters} />
      <KeyHints canAssign={reviewers.length > 0} />
      <QueueFilters params={params} />
      <QueueTable
        key={filterKey(params)}
        rows={queue.rows}
        reviewers={reviewers}
        assign={assignReviewerAction}
        empty={<NoMatches filters={filters} />}
      />
      <QueuePager
        offset={queue.offset}
        shown={queue.rows.length}
        total={queue.total}
        prevHref={queue.prevCursor === null ? null : queueHref(params, queue.prevCursor)}
        nextHref={queue.nextCursor === null ? null : queueHref(params, queue.nextCursor)}
      />
    </main>
  )
}
