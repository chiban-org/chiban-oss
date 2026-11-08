'use client'

import type { PickedTime } from '@/components/inspections/boardTypes'
import { Button } from '@/components/ui/button'
import { weekdayName } from '@/features/inspections/slotWeeks'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'

export function ReviewRow({
  picked,
  booking,
  onBook,
  onCancel,
}: {
  picked: PickedTime
  booking: boolean
  onBook: () => void
  onCancel: () => void
}) {
  const { day, start } = picked
  return (
    <div
      role="group"
      aria-label="Review the booking"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-action bg-canvas px-3 py-3"
    >
      <p className="m-0 font-semibold">
        {`Book ${weekdayName(day.date)}, ${formatCivilDate(day.date)} at ${minutesToClock(start)} with ${day.inspectorName}.`}
      </p>
      <div className="flex gap-2">
        <Button type="button" disabled={booking} onClick={onBook} className="min-h-11">
          {booking ? 'Booking' : 'Book'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={booking}
          onClick={onCancel}
          className="min-h-11"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
