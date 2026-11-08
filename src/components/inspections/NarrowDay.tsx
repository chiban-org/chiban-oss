'use client'

import { cellBookings } from '@/components/inspections/boardModel'
import { type BoardView, dayFor } from '@/components/inspections/boardView'
import { DayLabel } from '@/components/inspections/DayLabel'
import { GridCell } from '@/components/inspections/GridCell'
import { Button } from '@/components/ui/button'
import { weekdayName } from '@/features/inspections/slotWeeks'
import { formatCivilDate } from '@/lib/formatDate'
import { cn } from '@/lib/utils'

export function NarrowDay({
  view,
  shown,
  onShowDay,
}: {
  view: BoardView
  shown: string
  onShowDay: (date: string) => void
}) {
  const { review } = view
  return (
    <div className="space-y-4">
      <div role="group" aria-label="Days" className="flex flex-wrap gap-1.5">
        {view.dates.map((date) => (
          <Button
            key={date}
            type="button"
            variant="outline"
            aria-pressed={date === shown}
            onClick={() => onShowDay(date)}
            className={cn(
              'h-auto min-h-11 flex-col items-start gap-0 px-3 py-1.5 text-left',
              date === shown && 'border-action bg-action/10 hover:bg-action/10',
            )}
          >
            <DayLabel date={date} today={date === view.today} preferred={date === view.preferred} />
          </Button>
        ))}
      </div>
      <section data-plain aria-label={`${weekdayName(shown)}, ${formatCivilDate(shown)}`}>
        <ul className="m-0 list-none divide-y divide-hairline p-0">
          {view.rows.map((row) => (
            <li key={row.userId} aria-label={row.name} className="flex flex-col gap-2 py-3">
              <h3 className="m-0 font-semibold">{row.name}</h3>
              <GridCell
                day={dayFor(view, shown, row.userId)}
                bookings={cellBookings(view.bookings, {
                  date: shown,
                  inspectorUserId: row.userId,
                })}
                context={view.context}
              />
              {review !== null && review.inspectorUserId === row.userId && review.date === shown
                ? review.node
                : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
