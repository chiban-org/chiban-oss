import Link from 'next/link'
import { QueueTable } from '@/components/queue/QueueTable'
import { NoPermission } from '@/components/staff/NoPermission'
import { CORE_STATES, type CoreState } from '@/features/applications/states'
import { hasCapability } from '@/features/authz/capabilities'
import { stateFilterOptions } from '@/features/queue/stateFilterOptions'
import { listWorkQueue } from '@/features/queue/workQueue'
import { listReviewerChoices } from '@/features/reviews/reviewerView'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { requireStaffContext } from '@/server/requireStaff'
import { assignReviewerAction } from '../reviews/actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

interface SearchParams {
  state?: string
  q?: string
  mine?: string
  overdue?: string
  unpaid?: string
  cursor?: string
}

function stateFilter(state: string | undefined): CoreState[] | undefined {
  return CORE_STATES.find((s) => s === state) === undefined ? undefined : [state as CoreState]
}

function nextQuery(params: SearchParams, cursor: string): string {
  const query = new URLSearchParams()
  for (const key of ['state', 'q', 'mine', 'overdue', 'unpaid'] as const) {
    const value = params[key]
    if (value !== undefined && value !== '') query.set(key, value)
  }
  query.set('cursor', cursor)
  return query.toString()
}

function Filters({ params }: { params: SearchParams }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Search by number
        <input
          id="queue-search"
          name="q"
          defaultValue={params.q ?? ''}
          className="rounded-md border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select
          name="state"
          defaultValue={params.state ?? ''}
          className="rounded-md border px-3 py-2"
        >
          <option value="">Not draft</option>
          {stateFilterOptions().map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="mine" value="1" defaultChecked={params.mine === '1'} />
        Assigned to me
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === '1'} />
        Overdue only
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="unpaid" value="1" defaultChecked={params.unpaid === '1'} />
        Fees due
      </label>
      <button type="submit" className="rounded-md border px-4 py-2 text-sm">
        Apply filters
      </button>
    </form>
  )
}

export default async function QueuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const ctx = await requireStaffContext()
  if (!mayOpen('/staff/queue', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Work queue" action="see the work queue" />
  }
  const states = stateFilter(params.state)
  const queue = await listWorkQueue(
    ctx.db,
    ctx.actor,
    {
      filters: {
        ...(states === undefined ? {} : { states }),
        ...(params.q === undefined || params.q === '' ? {} : { numberContains: params.q }),
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
  return (
    <main>
      <h1>Work queue</h1>
      <p>{`${queue.total} ${queue.total === 1 ? 'application' : 'applications'}. Keys: j and k to move, Enter to open, a to assign a reviewer, / to search.`}</p>
      <Filters params={params} />
      <QueueTable rows={queue.rows} reviewers={reviewers} assign={assignReviewerAction} />
      {queue.nextCursor === null ? null : (
        <Link
          href={`/staff/queue?${nextQuery(params, queue.nextCursor)}`}
          className="mt-4 inline-block text-action underline"
        >
          Next page
        </Link>
      )}
    </main>
  )
}
