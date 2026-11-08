'use client'

import { openLabel } from '@/components/inspections/boardModel'
import {
  type BoardBooking,
  type BoardDay,
  type BoardItem,
  cellKey,
} from '@/components/inspections/boardTypes'
import { type SlotPick, TimeButtons } from '@/components/inspections/SlotWeeks'
import { Button } from '@/components/ui/button'
import { weekdayName } from '@/features/inspections/slotWeeks'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'

export interface CellContext {
  chosenId: string | null
  canPick: boolean
  busy: boolean
  expanded: string | null
  picked: { key: string; start: number } | null
  onToggle: (key: string) => void
  onPick: SlotPick
  onChoose: (item: BoardItem) => void
}

function BookedLine({
  booking,
  chosen,
  busy,
  onChoose,
}: {
  booking: BoardBooking
  chosen: boolean
  busy: boolean
  onChoose: (item: BoardItem) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      disabled={busy}
      onClick={() => onChoose(booking)}
      title={`${booking.address}, ${booking.contactName}`}
      className={cn(
        'flex w-full min-w-0 cursor-pointer items-baseline gap-x-1.5 rounded-sm border bg-transparent px-1.5 py-1 text-left font-[inherit] text-ink hover:bg-canvas disabled:cursor-default',
        chosen ? 'border-action bg-action/10' : 'border-transparent',
      )}
    >
      <span className="sr-only">Move</span>{' '}
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {minutesToClock(booking.startMinute)}
      </span>{' '}
      <span className="shrink-0 font-semibold">{booking.applicationNumber}</span>{' '}
      <span className="min-w-0 truncate">{booking.typeLabel}</span>
    </button>
  )
}

function OpenControl({
  day,
  booked,
  context,
}: {
  day: BoardDay
  booked: number
  context: CellContext
}) {
  const key = cellKey(day.date, day.inspectorUserId)
  const label = openLabel(day.freeStarts.length, booked)
  if (day.freeStarts.length === 0) {
    return <p className="m-0 px-1.5 py-1 text-muted-foreground">{label}</p>
  }
  const expanded = context.expanded === key
  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={expanded}
        aria-label={`${label}, ${weekdayName(day.date)}, ${formatCivilDate(day.date)}, ${day.inspectorName}`}
        disabled={!context.canPick}
        onClick={() => context.onToggle(key)}
        className="h-auto min-h-8 px-1.5 tabular-nums"
      >
        {label}
      </Button>
      {expanded ? (
        <TimeButtons
          day={day}
          onPick={context.onPick}
          disabled={!context.canPick}
          pickedStart={context.picked?.key === key ? context.picked.start : null}
        />
      ) : null}
    </div>
  )
}

export function GridCell({
  day,
  bookings,
  context,
}: {
  day: BoardDay | undefined
  bookings: BoardBooking[]
  context: CellContext
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {bookings.map((b) => (
        <BookedLine
          key={b.inspectionId}
          booking={b}
          chosen={context.chosenId === b.inspectionId}
          busy={context.busy}
          onChoose={context.onChoose}
        />
      ))}
      {day === undefined ? null : (
        <OpenControl day={day} booked={bookings.length} context={context} />
      )}
    </div>
  )
}
