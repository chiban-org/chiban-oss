import Link from 'next/link'
import { ApplicationStatusChip } from '@/components/ApplicationStatusChip'
import { Marker } from '@/components/board/PacketItems'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import type { HomeDetail } from '@/features/staffHome/homeTypes'
import { formatCivilDate } from '@/lib/formatDate'

function dueText(row: WorkQueueRow): string {
  if (row.nextDue === null) return 'No clock running'
  if (row.dueStatus === 'overdue') return `Was due ${formatCivilDate(row.nextDue)}`
  return `Due ${formatCivilDate(row.nextDue)}`
}

function Deadlines({ rows }: { rows: WorkQueueRow[] }) {
  return (
    <section aria-label="Next deadlines">
      <h3>Next deadlines</h3>
      {rows.length === 0 ? <p>No application has a clock running.</p> : null}
      <ul className="divide-y">
        {rows.map((row) => (
          <li
            key={row.applicationId}
            className="grid grid-cols-1 items-center justify-items-start gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(10rem,1fr)_auto_12rem] sm:justify-items-stretch"
          >
            <span className="flex flex-col">
              <Link
                href={`/staff/applications/${row.applicationId}`}
                className="whitespace-nowrap font-semibold"
              >
                {row.number}
              </Link>
              <span className="text-sm text-muted-foreground">{row.typeLabel}</span>
            </span>
            <ApplicationStatusChip
              state={row.state}
              substep={row.substep}
              substepLabel={row.substepLabel}
            />
            <span className="whitespace-nowrap text-sm sm:text-right">
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
    </section>
  )
}

function NextDays({ days }: { days: Extract<HomeDetail, { kind: 'days' }>['days'] }) {
  return (
    <section aria-label="Next inspection days">
      <h3>Next inspection days</h3>
      {days.length === 0 ? <p>No inspections are booked after today.</p> : null}
      <ul className="divide-y">
        {days.map((day) => (
          <li key={day.date} className="py-2">
            <Link href={day.href}>{formatCivilDate(day.date)}</Link>
            <span className="text-muted-foreground">{`, ${day.count === 1 ? '1 inspection' : `${day.count} inspections`}`}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NextMeeting({ detail }: { detail: Extract<HomeDetail, { kind: 'meeting' }> }) {
  const { next, later } = detail
  return (
    <section aria-label="Next meeting">
      <h3>Next meeting</h3>
      {next === null ? (
        <p>No meeting of your board is coming up.</p>
      ) : (
        <p>
          <span className="font-semibold">{next.label}</span>
          {next.marker === null ? null : <Marker text={next.marker} />}
          <br />
          {next.href === null ? (
            <span className="text-muted-foreground">The packet is not ready yet.</span>
          ) : (
            <Link href={next.href}>Open the packet</Link>
          )}
        </p>
      )}
      {later > 0 ? (
        <p>{`${later} later ${later === 1 ? 'meeting' : 'meetings'} on the board page.`}</p>
      ) : null}
    </section>
  )
}

export function HomeDetailBlock({ detail }: { detail: HomeDetail | null }) {
  if (detail === null) return null
  if (detail.kind === 'deadlines') return <Deadlines rows={detail.rows} />
  if (detail.kind === 'days') return <NextDays days={detail.days} />
  return <NextMeeting detail={detail} />
}
