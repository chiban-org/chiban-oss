'use client'

import { type ReactNode, useState } from 'react'
import { RequestQueue } from '@/components/inspections/RequestQueue'
import { SlotDayRow, type SlotPick, WeekSwitcher } from '@/components/inspections/SlotWeeks'
import { firstOpenWeek, groupSlotWeeks, weekStart } from '@/features/inspections/slotWeeks'
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

function OpenSlots({
  days,
  today,
  chosen,
  shown,
  onShow,
  onPick,
  message,
}: {
  days: BoardDay[]
  today: string
  chosen: BoardRequest | undefined
  shown: CivilDate | null
  onShow: (start: CivilDate) => void
  onPick: SlotPick
  message: string | null
}) {
  const weeks = groupSlotWeeks(days, today as CivilDate)
  const week = weeks.find((w) => w.start === shown) ?? weeks[0]
  return (
    <section aria-label="Open slots" className="m-0 min-w-0">
      <h2>Open slots</h2>
      <p className={chosen === undefined ? 'm-0 text-muted-foreground' : 'm-0 font-semibold'}>
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
                <SlotDayRow key={`${day.date}-${day.inspectorUserId}`} day={day} onPick={onPick} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

export function ScheduleBoard({
  requests,
  days,
  today,
  takeRequest = null,
  onSchedule,
  message,
}: {
  requests: BoardRequest[]
  days: BoardDay[]
  today: string
  takeRequest?: ReactNode
  onSchedule: (choice: ScheduleChoice) => void
  message: string | null
}) {
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [shown, setShown] = useState<CivilDate | null>(() =>
    firstOpenWeek(groupSlotWeeks(days, today as CivilDate)),
  )
  const chosen = requests.find((r) => r.inspectionId === chosenId)
  const choose = (request: BoardRequest) => {
    setChosenId(request.inspectionId)
    const preferred = request.preferredDate
    if (preferred === null) return
    const start = weekStart(preferred as CivilDate)
    if (days.some((d) => weekStart(d.date as CivilDate) === start)) setShown(start)
  }
  const pick: SlotPick = (day, start) => {
    if (chosen === undefined) return
    onSchedule({
      inspectionId: chosen.inspectionId,
      rowVersion: chosen.rowVersion,
      date: day.date,
      startMinute: start,
      inspectorUserId: day.inspectorUserId,
    })
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
        onShow={setShown}
        onPick={pick}
        message={message}
      />
    </div>
  )
}
