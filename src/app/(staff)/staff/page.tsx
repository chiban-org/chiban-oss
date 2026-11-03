import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ApplicationStatusChip } from '@/components/ApplicationStatusChip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  countWorkQueue,
  listWorkQueue,
  type WorkQueueFilters,
  type WorkQueueRow,
} from '@/features/queue/workQueue'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffActor, requireStaffContext } from '@/server/requireStaff'

const TIMEOUT_MS = 10_000
const DUE_SOON = 6

interface Attention {
  label: string
  href: string
  filters: WorkQueueFilters
}

const ATTENTION: readonly Attention[] = [
  { label: 'Past a deadline', href: '/staff/queue?due=overdue', filters: { due: ['overdue'] } },
  {
    label: 'Assigned to you for review',
    href: '/staff/queue?assigned=me',
    filters: { assigned: ['me'] },
  },
  { label: 'Waiting on fees', href: '/staff/queue?flag=fees', filters: { flags: ['fees'] } },
  {
    label: 'Submitted and not yet started',
    href: '/staff/queue?state=submitted',
    filters: { states: ['submitted'] },
  },
]

function AttentionList({ counts }: { counts: number[] }) {
  return (
    <section aria-label="Needs attention">
      <h2>Needs attention</h2>
      <ul className="divide-y">
        {ATTENTION.map((item, index) => {
          const count = counts[index] ?? 0
          return (
            <li key={item.href} className="flex items-baseline gap-4 py-3">
              <span
                className={`w-10 text-right text-2xl font-semibold tabular-nums ${count === 0 ? 'text-muted-foreground' : 'text-ink'}`}
              >
                {count}
              </span>
              <span className="flex-1">{item.label}</span>
              {count === 0 ? null : <Link href={item.href}>Open in the queue</Link>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function dueText(row: WorkQueueRow): string {
  if (row.nextDue === null) return 'No clock running'
  if (row.dueStatus === 'overdue') return `Was due ${formatCivilDate(row.nextDue)}`
  return `Due ${formatCivilDate(row.nextDue)}`
}

function DueSoon({ rows }: { rows: WorkQueueRow[] }) {
  return (
    <section aria-label="Next deadlines">
      <h2>Next deadlines</h2>
      {rows.length === 0 ? <p>No application has a clock running.</p> : null}
      <ul className="divide-y">
        {rows.map((row) => (
          <li
            key={row.applicationId}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto_12rem]"
          >
            <span className="flex min-w-0 flex-col">
              <Link
                href={`/staff/applications/${row.applicationId}`}
                className="whitespace-nowrap font-semibold"
              >
                {row.number}
              </Link>
              <span className="truncate text-sm text-muted-foreground">{row.typeLabel}</span>
            </span>
            <ApplicationStatusChip
              state={row.state}
              substep={row.substep}
              substepLabel={row.substepLabel}
            />
            <span className="col-span-2 whitespace-nowrap text-sm sm:col-span-1 sm:text-right">
              <span
                className={
                  row.dueStatus === 'overdue' ? 'attention font-semibold' : 'text-muted-foreground'
                }
              >
                {dueText(row)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Link href="/staff/queue">Open the work queue</Link>
    </section>
  )
}

function ParcelSearch() {
  return (
    <form role="search" method="get" action="/staff/parcels" className="flex max-w-2xl gap-3">
      <label htmlFor="home-parcel-search" className="sr-only">
        Address, owner, or parcel ID
      </label>
      <Input
        id="home-parcel-search"
        name="q"
        placeholder="Address, owner, or parcel ID"
        className="h-11 flex-1 text-base md:text-base"
      />
      <Button type="submit" size="lg" className="h-11 text-base">
        Find a parcel
      </Button>
    </form>
  )
}

export default async function StaffHome() {
  const actor = await requireStaffActor(AbortSignal.timeout(TIMEOUT_MS))
  const inspectorOnly = actor.roles.length > 0 && actor.roles.every((role) => role === 'inspector')
  if (inspectorOnly) redirect('/staff/inspections/day')
  const ctx = await requireStaffContext()
  if (!mayOpen('/staff/queue', await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    redirect('/staff/applications')
  }
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const [counts, soon] = await Promise.all([
    countWorkQueue(
      ctx.db,
      ctx.actor,
      ATTENTION.map((item) => item.filters),
      today,
      ctx.signal,
    ),
    listWorkQueue(ctx.db, ctx.actor, { filters: {}, limit: DUE_SOON }, ctx.signal),
  ])
  return (
    <main>
      <header className="mb-8 flex flex-col gap-5 border-b pb-8">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-muted-foreground">{formatCivilDate(today)}</p>
          <h1>Today</h1>
        </div>
        <ParcelSearch />
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start [&>section]:m-0">
        <AttentionList counts={counts} />
        <DueSoon rows={soon.rows.filter((row) => row.nextDue !== null)} />
      </div>
    </main>
  )
}
