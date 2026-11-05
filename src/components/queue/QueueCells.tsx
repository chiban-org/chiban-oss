import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import type { WorkQueueRow } from '@/features/queue/workQueue'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { formatCivilDateShort } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

export const STACKED_CELL =
  'max-md:col-span-2 max-md:grid max-md:grid-cols-[5.5rem_minmax(0,1fr)] max-md:gap-x-2 max-md:before:font-semibold max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]'

const CARD_CELL = 'max-md:block max-md:p-0'

function days(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`
}

export function ParcelCell({ row }: { row: WorkQueueRow }) {
  return (
    <td data-label="Parcel" className={STACKED_CELL}>
      {row.parcelDisplayId === null ? (
        <span className="text-muted-foreground">No map-lot ID</span>
      ) : (
        <Link href={`/staff/parcels/${row.parcelId}`} className="whitespace-nowrap tabular-nums">
          {row.parcelDisplayId}
        </Link>
      )}
    </td>
  )
}

export function ReceivedCell({ row }: { row: WorkQueueRow }) {
  return (
    <td data-label="Received" className={cn(STACKED_CELL, 'whitespace-nowrap tabular-nums')}>
      {row.receivedDate === null ? (
        <span className="text-muted-foreground">Not received</span>
      ) : (
        formatCivilDateShort(row.receivedDate)
      )}
    </td>
  )
}

export function ApplicationCell({ row }: { row: WorkQueueRow }) {
  return (
    <td data-label="Application" className={CARD_CELL}>
      <Link
        href={`/staff/applications/${row.applicationId}`}
        className="whitespace-nowrap font-semibold"
      >
        {row.number}
      </Link>
      <span className="block max-w-72 truncate text-muted-foreground" title={row.projectTitle}>
        {row.projectTitle}
      </span>
      <span className="block max-w-72 truncate text-xs text-muted-foreground" title={row.typeLabel}>
        {row.typeLabel}
      </span>
      {row.unknownPayment || row.preservationIncomplete ? (
        <span className="mt-1.5 flex flex-wrap gap-1">
          {row.unknownPayment ? (
            <StatusChip status="overdue" label="Payment outcome unknown" />
          ) : null}
          {row.preservationIncomplete ? (
            <StatusChip status="overdue" label="Preservation incomplete" />
          ) : null}
        </span>
      ) : null}
    </td>
  )
}

function DueHeadline({ row }: { row: WorkQueueRow }) {
  const daysLeft = row.daysUntilDue ?? 0
  if (row.dueStatus === 'overdue') {
    return <StatusChip status="overdue" label={`${days(-daysLeft)} overdue`} />
  }
  if (row.dueStatus === 'warning') {
    return <span className="attention font-semibold">{`Due in ${days(daysLeft)}`}</span>
  }
  return row.nextDue === null ? null : (
    <span className="font-medium tabular-nums">{formatCivilDateShort(row.nextDue)}</span>
  )
}

function dueDetail(row: WorkQueueRow): string | null {
  if (row.nextDue === null) return null
  if (row.dueStatus === 'ok') return row.nextDueLabel
  const date = formatCivilDateShort(row.nextDue)
  return row.nextDueLabel === null ? date : `${row.nextDueLabel}, ${date}`
}

function BoardDate({ what, due, overdue }: { what: string; due: string; overdue: boolean }) {
  const date = formatCivilDateShort(due)
  return overdue ? (
    <span className="block font-semibold text-status-overdue-fg">{`${what} overdue, due ${date}`}</span>
  ) : (
    <span className="block">{`${what} due ${date}`}</span>
  )
}

export function DueCell({ row }: { row: WorkQueueRow }) {
  const detail = dueDetail(row)
  const empty = row.nextDue === null && row.noticeDue === null && row.filingDue === null
  return (
    <td data-label="Due" className={cn(CARD_CELL, empty ? 'max-md:hidden' : STACKED_CELL)}>
      {empty ? null : (
        <div className="flex flex-col items-start gap-0.5">
          <DueHeadline row={row} />
          {detail === null ? null : <span className="text-muted-foreground">{detail}</span>}
          {row.noticeDue === null ? null : (
            <BoardDate what="Notice" due={row.noticeDue} overdue={row.noticeOverdue} />
          )}
          {row.filingDue === null || row.filingDue === row.nextDue ? null : (
            <BoardDate what="Filing" due={row.filingDue} overdue={row.filingOverdue} />
          )}
        </div>
      )}
    </td>
  )
}

export function FeesCell({ cents }: { cents: number }) {
  return (
    <td
      data-label="Fees"
      className={cn(
        CARD_CELL,
        'whitespace-nowrap tabular-nums md:text-right',
        cents > 0 ? STACKED_CELL : 'max-md:hidden',
      )}
    >
      {cents > 0 ? (
        <div>{formatCents(cents)}</div>
      ) : (
        <span className="text-muted-foreground">
          <span aria-hidden={true}>-</span>
          <span className="sr-only">None</span>
        </span>
      )}
    </td>
  )
}

function Unassigned({ onAssign }: { onAssign: (() => void) | null }) {
  if (onAssign === null) return <span className="text-muted-foreground">Unassigned</span>
  return (
    <button
      type="button"
      onClick={onAssign}
      className="text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-action"
    >
      Unassigned
    </button>
  )
}

export function ReviewersCell({
  row,
  onAssign,
}: {
  row: WorkQueueRow
  onAssign: (() => void) | null
}) {
  const names = row.reviewers.map((r) => `${r.name} (${reviewStatusLabel(r.status)})`).join(', ')
  return (
    <td data-label="Reviewers" className={cn(CARD_CELL, STACKED_CELL)}>
      <div>{names === '' ? <Unassigned onAssign={onAssign} /> : names}</div>
    </td>
  )
}
