'use client'

import type { BoardDay } from '@/components/inspections/ScheduleBoard'
import { Button } from '@/components/ui/button'
import { openCountText, type SlotWeek, weekdayName } from '@/features/inspections/slotWeeks'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'
import type { CivilDate } from '@/types/civilDate'

export type SlotPick = (day: BoardDay, start: number) => void

export function WeekSwitcher({
  weeks,
  shown,
  onShow,
}: {
  weeks: SlotWeek<BoardDay>[]
  shown: CivilDate | null
  onShow: (start: CivilDate) => void
}) {
  return (
    <div
      role="group"
      aria-label="Weeks"
      className="flex flex-wrap gap-2 @4xl:flex-col @4xl:flex-nowrap"
    >
      {weeks.map((week) => {
        const active = week.start === shown
        return (
          <Button
            key={week.start}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={active}
            onClick={() => onShow(week.start)}
            className={cn(
              'gap-2 @4xl:justify-between',
              active && 'border-action bg-action/10 font-semibold hover:bg-action/10',
            )}
          >
            {week.label}
            <span className="font-normal text-muted-foreground tabular-nums">
              {openCountText(week.open)}
            </span>
          </Button>
        )
      })}
    </div>
  )
}

function DayHeading({ day }: { day: BoardDay }) {
  return (
    <div className="min-w-0">
      <p className="m-0 font-semibold">
        {weekdayName(day.date)}
        <span className="font-normal">{`, ${formatCivilDate(day.date)}`}</span>
      </p>
      <p className="m-0 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
        <span>{day.inspectorName}</span>
        {day.freeStarts.length === 0 ? null : (
          <span className="tabular-nums">{openCountText(day.freeStarts.length)}</span>
        )}
      </p>
    </div>
  )
}

export function SlotDayRow({ day, onPick }: { day: BoardDay; onPick: SlotPick }) {
  const full = day.freeStarts.length === 0
  return (
    <li
      aria-label={`${weekdayName(day.date)}, ${formatCivilDate(day.date)}, ${day.inspectorName}`}
      data-full={full}
      className={cn(
        'grid gap-x-6 gap-y-2 py-4 first:pt-0 sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-start',
        full && 'text-muted-foreground',
      )}
    >
      <DayHeading day={day} />
      {full ? (
        <p className="m-0 self-center text-sm">No open times</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {day.freeStarts.map((start) => (
            <Button
              key={start}
              type="button"
              variant="outline"
              size="sm"
              aria-label={`${minutesToClock(start)}, ${formatCivilDate(day.date)}, ${day.inspectorName}`}
              onClick={() => onPick(day, start)}
              className="min-w-[5.5rem] tabular-nums"
            >
              {minutesToClock(start)}
            </Button>
          ))}
        </div>
      )}
    </li>
  )
}
