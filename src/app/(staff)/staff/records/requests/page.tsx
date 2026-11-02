import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { RTK_STATUSES, type RtkStatus } from '@/db/schema'
import { RTK_STATUS_LABELS, RTK_VIA_LABELS } from '@/features/rtk/labels'
import { listRtkRequests } from '@/features/rtk/requests'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { logRequestAction } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

interface SearchParams {
  status?: string
  overdue?: string
  cursor?: string
}

function statusOf(value: string | undefined): RtkStatus | undefined {
  return RTK_STATUSES.find((s) => s === value)
}

export default async function RightToKnowLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const ctx = await requireStaffContext()
  if (!mayOpen('/staff/records/requests', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Right-to-Know requests" action="see Right-to-Know requests" />
  }
  const status = statusOf(params.status)
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const list = await listRtkRequests(
    ctx.db,
    ctx.actor,
    {
      filters: {
        ...(status === undefined ? {} : { status }),
        ...(params.overdue === '1' ? { overdueOnly: true } : {}),
      },
      limit: PAGE_SIZE,
      today,
      ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
    },
    ctx.signal,
  )
  return (
    <main className="space-y-6">
      <h1>Right-to-Know requests</h1>
      <form method="get" className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            name="status"
            defaultValue={params.status ?? ''}
            className="rounded-md border px-3 py-2"
          >
            <option value="">All</option>
            {RTK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RTK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={params.overdue === '1'} />
          Past due only
        </label>
        <button type="submit" className="rounded-md border px-4 py-2 text-sm">
          Apply filter
        </button>
      </form>
      {list.rows.length === 0 ? (
        <p>No requests match.</p>
      ) : (
        <table className="w-full text-left">
          <thead>
            <tr>
              <th scope="col">Request</th>
              <th scope="col">What was asked for</th>
              <th scope="col">Received</th>
              <th scope="col">Status</th>
              <th scope="col">Next date</th>
            </tr>
          </thead>
          <tbody>
            {list.rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link
                    href={`/staff/records/requests/${row.id}`}
                    className="text-action underline"
                  >
                    {row.number}
                  </Link>
                </td>
                <td>{row.description}</td>
                <td>{formatCivilDate(row.receivedOn)}</td>
                <td>{RTK_STATUS_LABELS[row.status]}</td>
                <td>
                  {row.dueOn === null
                    ? ''
                    : `${formatCivilDate(row.dueOn)}${row.dueOn < today ? ' (past due)' : ''}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {list.nextCursor === null ? null : (
        <Link
          href={`/staff/records/requests?cursor=${encodeURIComponent(list.nextCursor)}${status === undefined ? '' : `&status=${status}`}${params.overdue === '1' ? '&overdue=1' : ''}`}
          className="inline-block text-action underline"
        >
          Next page
        </Link>
      )}
      <section aria-labelledby="log-request" className="space-y-3 border-t pt-4">
        <h2 id="log-request">Log a request</h2>
        <ActionForm action={logRequestAction} submitLabel="Log request">
          <TextField
            label="Date received"
            name="receivedOn"
            type="date"
            defaultValue={today}
            required
          />
          <SelectField
            label="How it arrived"
            name="receivedVia"
            options={Object.entries(RTK_VIA_LABELS)}
          />
          <TextField label="Requester name" name="requesterName" />
          <TextField label="Requester email, phone, or address" name="requesterContact" />
          <AreaField label="What was asked for" name="description" rows={3} required />
        </ActionForm>
      </section>
    </main>
  )
}
