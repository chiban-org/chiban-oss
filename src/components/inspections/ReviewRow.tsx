'use client'

import { useState } from 'react'
import { useFieldError } from '@/components/fieldErrors'
import type { PickedTime } from '@/components/inspections/boardTypes'
import { REASON_HINT, REASON_LABEL } from '@/components/inspections/OffGridBooking'
import { AreaField } from '@/components/staff/fields'
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
  onBook: (offGridReason?: string) => void
  onCancel: () => void
}) {
  const { day, start } = picked
  const askReason = useFieldError('offGridReason') !== null
  const [reason, setReason] = useState('')
  return (
    <div
      role="group"
      aria-label="Review the booking"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-action bg-canvas px-3 py-3"
    >
      <p className="m-0 font-semibold">
        {`Book ${weekdayName(day.date)}, ${formatCivilDate(day.date)} at ${minutesToClock(start)} with ${day.inspectorName}.`}
      </p>
      {askReason ? (
        <AreaField
          label={REASON_LABEL}
          hint={REASON_HINT}
          name="offGridReason"
          rows={2}
          className="w-full"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={booking}
          onClick={() => onBook(askReason ? reason : undefined)}
          className="min-h-11"
        >
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
