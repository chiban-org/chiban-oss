'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { weekTabLabel } from '@/components/inspections/boardModel'
import type { BoardDay } from '@/components/inspections/boardTypes'
import { Button } from '@/components/ui/button'
import { openCountText, type SlotWeek, type WeekDay } from '@/features/inspections/slotWeeks'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'
import type { CivilDate } from '@/types/civilDate'

export type SlotPick = (day: BoardDay, start: number) => void

function StepButton({
  label,
  icon,
  target,
  onShow,
}: {
  label: string
  icon: ReactNode
  target: CivilDate | undefined
  onShow: (start: CivilDate) => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={label}
      disabled={target === undefined}
      onClick={() => {
        if (target !== undefined) onShow(target)
      }}
    >
      {icon}
    </Button>
  )
}

export function WeekSwitcher({
  weeks,
  shown,
  onShow,
}: {
  weeks: SlotWeek<WeekDay>[]
  shown: CivilDate | null
  onShow: (start: CivilDate) => void
}) {
  const index = weeks.findIndex((w) => w.start === shown)
  return (
    <div
      role="group"
      aria-label="Weeks"
      className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-1"
    >
      <StepButton
        label="Earlier week"
        icon={<ChevronLeft aria-hidden="true" />}
        target={weeks[index - 1]?.start}
        onShow={onShow}
      />
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
              'gap-2',
              active && 'border-action bg-action/10 font-semibold hover:bg-action/10',
            )}
          >
            {weekTabLabel(week)}
            <span className="font-normal text-muted-foreground tabular-nums">
              {openCountText(week.open)}
            </span>
          </Button>
        )
      })}
      <StepButton
        label="Later week"
        icon={<ChevronRight aria-hidden="true" />}
        target={index < 0 ? undefined : weeks[index + 1]?.start}
        onShow={onShow}
      />
    </div>
  )
}

export function TimeButtons({
  day,
  onPick,
  disabled,
  pickedStart = null,
}: {
  day: BoardDay
  onPick: SlotPick
  disabled: boolean
  pickedStart?: number | null
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {day.freeStarts.map((start) => (
        <Button
          key={start}
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${minutesToClock(start)}, ${formatCivilDate(day.date)}, ${day.inspectorName}`}
          disabled={disabled}
          aria-pressed={start === pickedStart}
          onClick={() => onPick(day, start)}
          className={cn(
            'min-h-11 min-w-[5.5rem] tabular-nums',
            start === pickedStart && 'border-action bg-action/10 font-semibold hover:bg-action/10',
          )}
        >
          {minutesToClock(start)}
        </Button>
      ))}
    </div>
  )
}
