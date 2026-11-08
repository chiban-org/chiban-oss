'use client'

import { Fragment } from 'react'
import { cellBookings } from '@/components/inspections/boardModel'
import { type BoardView, dayFor } from '@/components/inspections/boardView'
import { DayLabel } from '@/components/inspections/DayLabel'
import { GridCell } from '@/components/inspections/GridCell'
import { cn } from '@/lib/utils'

function columnTone(view: BoardView, date: string): string {
  if (date === view.preferred) return 'bg-action/10'
  return date === view.today ? 'bg-canvas' : ''
}

export function WeekGrid({ view, label }: { view: BoardView; label: string }) {
  const { dates, rows, review } = view
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full min-w-[40rem] table-fixed border-collapse">
        <thead>
          <tr>
            <th scope="col" className="w-36 border-hairline border-b px-2 py-2 text-left">
              <span className="sr-only">Inspector</span>
            </th>
            {dates.map((date) => (
              <th
                key={date}
                scope="col"
                className={cn(
                  'border-hairline border-b border-l px-2 py-2 text-left align-bottom font-semibold',
                  columnTone(view, date),
                  date === view.preferred && 'border-t-2 border-t-action',
                )}
              >
                <DayLabel
                  date={date}
                  today={date === view.today}
                  preferred={date === view.preferred}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.userId}>
              <tr>
                <th
                  scope="row"
                  className="border-hairline border-b px-2 py-2 text-left align-top font-semibold"
                >
                  {row.name}
                </th>
                {dates.map((date) => (
                  <td
                    key={date}
                    data-today={date === view.today}
                    data-preferred={date === view.preferred}
                    className={cn(
                      'border-hairline border-b border-l px-1 py-1.5 align-top',
                      columnTone(view, date),
                    )}
                  >
                    <GridCell
                      day={dayFor(view, date, row.userId)}
                      bookings={cellBookings(view.bookings, { date, inspectorUserId: row.userId })}
                      context={view.context}
                    />
                  </td>
                ))}
              </tr>
              {review !== null && review.inspectorUserId === row.userId ? (
                <tr>
                  <td colSpan={dates.length + 1} className="border-hairline border-b px-1 py-2">
                    {review.node}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
