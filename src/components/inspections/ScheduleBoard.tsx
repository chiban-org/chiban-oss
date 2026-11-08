'use client'

import { type ReactNode, useRef, useState } from 'react'
import { RequestQueue } from '@/components/inspections/RequestQueue'
import { SlotDayRow, type SlotPick, WeekSwitcher } from '@/components/inspections/SlotWeeks'
import { Button } from '@/components/ui/button'
import {
  firstOpenWeek,
  groupSlotWeeks,
  weekdayName,
  weekStart,
} from '@/features/inspections/slotWeeks'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export interface BoardRequest {
  inspectionId: string
  rowVersion: number
  applicationNumber: string
  typeLabel: string
  channel: 'phone' | 'counter' | 'portal'
  preferredDate: string | null
  isReinspection: boolean
  address: string
  contactName: string
  scheduledFor?: string
}

export interface BoardDay {
  date: string
  inspectorUserId: string
  inspectorName: string
  freeStarts: number[]
  booked: number
}

export interface ScheduleChoice {
  inspectionId: string
  rowVersion: number
  date: string
  startMinute: number
  inspectorUserId: string
}

function pickPrompt(request: BoardRequest | undefined): string {
  return request === undefined
    ? 'Choose a request, then an open time.'
    : `Pick a time for ${request.applicationNumber}, ${request.typeLabel}.`
}

interface PickedTime {
  day: BoardDay
  start: number
}

function ReviewRow({
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
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-canvas px-3 py-3"
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

function OpenSlots({
  days,
  today,
  chosen,
  shown,
  onShow,
  onPick,
  picked,
  booking,
  onBook,
  onCancel,
  message,
  promptRef,
}: {
  days: BoardDay[]
  today: string
  chosen: BoardRequest | undefined
  shown: CivilDate | null
  onShow: (start: CivilDate) => void
  onPick: SlotPick
  picked: PickedTime | null
  booking: boolean
  onBook: () => void
  onCancel: () => void
  message: string | null
  promptRef: React.RefObject<HTMLParagraphElement | null>
}) {
  const weeks = groupSlotWeeks(days, today as CivilDate)
  const week = weeks.find((w) => w.start === shown) ?? weeks[0]
  return (
    <section aria-label="Open slots" className="m-0 min-w-0">
      <h2>Open slots</h2>
      <p
        ref={promptRef}
        tabIndex={-1}
        className={chosen === undefined ? 'm-0 text-muted-foreground' : 'm-0 font-semibold'}
      >
        {pickPrompt(chosen)}
      </p>
      {message === null ? null : <p role="status">{message}</p>}
      {week === undefined ? (
        <p>No inspection days in this range.</p>
      ) : (
        <div className="@container">
          <div className="grid gap-x-8 gap-y-5 @4xl:grid-cols-[18rem_minmax(0,1fr)] @4xl:items-start">
            <WeekSwitcher weeks={weeks} shown={week.start} onShow={onShow} />
            <ul className="m-0 list-none divide-y divide-hairline p-0">
              {week.days.map((day) => (
                <SlotDayRow
                  key={`${day.date}-${day.inspectorUserId}`}
                  day={day}
                  onPick={onPick}
                  disabled={chosen === undefined || booking}
                  preferred={chosen?.preferredDate === day.date}
                  review={
                    picked !== null &&
                    picked.day.date === day.date &&
                    picked.day.inspectorUserId === day.inspectorUserId ? (
                      <ReviewRow
                        picked={picked}
                        booking={booking}
                        onBook={onBook}
                        onCancel={onCancel}
                      />
                    ) : null
                  }
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

const NARROW = '(max-width: 1023px)'

function isNarrow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches
}

export function ScheduleBoard({
  requests,
  days,
  today,
  takeRequest = null,
  onSchedule,
  message,
  initialChosenId = null,
}: {
  requests: BoardRequest[]
  days: BoardDay[]
  today: string
  takeRequest?: ReactNode
  onSchedule: (choice: ScheduleChoice) => Promise<boolean>
  message: string | null
  initialChosenId?: string | null
}) {
  const initial = requests.find((r) => r.inspectionId === initialChosenId)
  const [chosenId, setChosenId] = useState<string | null>(initial?.inspectionId ?? null)
  const [picked, setPicked] = useState<PickedTime | null>(null)
  const [booking, setBooking] = useState(false)
  const [shown, setShown] = useState<CivilDate | null>(() => {
    const weeks = groupSlotWeeks(days, today as CivilDate)
    return preferredWeek(initial, days) ?? firstOpenWeek(weeks)
  })
  const promptRef = useRef<HTMLParagraphElement | null>(null)
  const chosen = requests.find((r) => r.inspectionId === chosenId)
  const choose = (request: BoardRequest) => {
    setChosenId(request.inspectionId)
    setPicked(null)
    const week = preferredWeek(request, days)
    if (week !== null) setShown(week)
    if (isNarrow()) promptRef.current?.focus()
  }
  const showWeek = (start: CivilDate) => {
    setPicked(null)
    setShown(start)
  }
  const pick: SlotPick = (day, start) => {
    if (chosen !== undefined) setPicked({ day, start })
  }
  const book = async () => {
    if (chosen === undefined || picked === null) return
    setBooking(true)
    const ok = await onSchedule({
      inspectionId: chosen.inspectionId,
      rowVersion: chosen.rowVersion,
      date: picked.day.date,
      startMinute: picked.start,
      inspectorUserId: picked.day.inspectorUserId,
    })
    setBooking(false)
    if (!ok) return
    setPicked(null)
    setChosenId((current) => (current === chosen.inspectionId ? null : current))
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
      <div data-testid="request-column" className="flex min-w-0 flex-col gap-5 [&>section]:m-0">
        {takeRequest}
        <RequestQueue requests={requests} chosenId={chosenId} onChoose={choose} />
      </div>
      <OpenSlots
        days={days}
        today={today}
        chosen={chosen}
        shown={shown}
        onShow={showWeek}
        onPick={pick}
        picked={picked}
        booking={booking}
        onBook={() => void book()}
        onCancel={() => setPicked(null)}
        message={message}
        promptRef={promptRef}
      />
    </div>
  )
}

function preferredWeek(request: BoardRequest | undefined, days: BoardDay[]): CivilDate | null {
  const preferred = request?.preferredDate ?? null
  if (preferred === null) return null
  const start = weekStart(preferred as CivilDate)
  return days.some((d) => weekStart(d.date as CivilDate) === start) ? start : null
}
