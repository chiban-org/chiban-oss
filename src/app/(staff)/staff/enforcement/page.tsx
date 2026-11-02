import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { EnforcementQueueTable } from '@/components/enforcement/EnforcementQueueTable'
import { TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { ENFORCEMENT_STATUSES, type EnforcementStatus } from '@/db/schema'
import { listCaseQueue } from '@/features/enforcement/caseQueue'
import { CASE_STATUS_LABELS } from '@/features/enforcement/labels'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { openCaseAction, staffComplaintAction } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

interface SearchParams {
  status?: string
  cursor?: string
}

function statusOf(value: string | undefined): EnforcementStatus | undefined {
  return ENFORCEMENT_STATUSES.find((s) => s === value)
}

export default async function EnforcementQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const ctx = await requireStaffContext()
  if (!mayOpen('/staff/enforcement', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Code enforcement" action="see code enforcement cases" />
  }
  const status = statusOf(params.status)
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const queue = await listCaseQueue(
    ctx.db,
    ctx.actor,
    {
      filters: status === undefined ? {} : { status },
      limit: PAGE_SIZE,
      ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
    },
    today,
    ctx.signal,
  )
  return (
    <main className="space-y-6">
      <h1>Code enforcement</h1>
      <p>Keys: j and k to move, Enter to open a case.</p>
      <form method="get" className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Status
          <select
            name="status"
            defaultValue={params.status ?? ''}
            className="rounded-md border px-3 py-2"
          >
            <option value="">All</option>
            {ENFORCEMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CASE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border px-4 py-2 text-sm">
          Apply filter
        </button>
      </form>
      <EnforcementQueueTable rows={queue.rows} />
      {queue.nextCursor === null ? null : (
        <Link
          href={`/staff/enforcement?cursor=${encodeURIComponent(queue.nextCursor)}${status === undefined ? '' : `&status=${status}`}`}
          className="inline-block text-action underline"
        >
          Next page
        </Link>
      )}
      <section aria-labelledby="open-case" className="space-y-2">
        <h2 id="open-case">Open a case</h2>
        <ActionForm action={openCaseAction} submitLabel="Open case" variant="default">
          <TextField label="Where is the property?" name="locationText" required />
        </ActionForm>
      </section>
      <section aria-labelledby="enter-complaint" className="space-y-2">
        <h2 id="enter-complaint">Enter a complaint taken by phone or at the counter</h2>
        <p>Entering a complaint opens a case for it.</p>
        <ActionForm action={staffComplaintAction} submitLabel="Record complaint" variant="default">
          <TextField label="Where is the property?" name="locationText" required />
          <TextField label="What was reported?" name="description" required />
        </ActionForm>
      </section>
    </main>
  )
}
