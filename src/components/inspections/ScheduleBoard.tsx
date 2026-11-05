'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { minutesToClock } from '@/features/inspections/zonedTime'
import { formatCivilDate } from '@/lib/formatDate'

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

const CHANNEL_LABEL = { phone: 'Phone', counter: 'Counter', portal: 'Portal' } as const

const OPEN_DAYS = 3

type SlotPick = (day: BoardDay, start: number) => void

function SlotButtons({ day, onPick }: { day: BoardDay; onPick: SlotPick }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {day.freeStarts.length === 0 ? <span>Full</span> : null}
      {day.freeStarts.map((start) => (
        <Button
          key={start}
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${minutesToClock(start)}, ${formatCivilDate(day.date)}, ${day.inspectorName}`}
          onClick={() => onPick(day, start)}
          className="tabular-nums"
        >
          {minutesToClock(start)}
        </Button>
      ))}
    </div>
  )
}

function openText(day: BoardDay): string {
  return day.freeStarts.length === 0 ? 'full' : `${day.freeStarts.length} open`
}

function SlotDay({ day, folded, onPick }: { day: BoardDay; folded: boolean; onPick: SlotPick }) {
  const slots = <SlotButtons day={day} onPick={onPick} />
  if (folded) {
    return (
      <details className="border-t pt-3">
        <summary className="font-semibold">
          {`${formatCivilDate(day.date)}, ${day.inspectorName}, ${openText(day)}`}
        </summary>
        {slots}
      </details>
    )
  }
  return (
    <div className="border-t pt-3">
      <p className="m-0 font-semibold">{formatCivilDate(day.date)}</p>
      <p className="m-0 text-muted-foreground">{day.inspectorName}</p>
      {slots}
    </div>
  )
}

function matches(request: BoardRequest, query: string): boolean {
  if (query === '') return true
  const haystack =
    `${request.applicationNumber} ${request.typeLabel} ${request.address} ${request.contactName}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

export function ScheduleBoard({
  requests,
  days,
  onSchedule,
  message,
}: {
  requests: BoardRequest[]
  days: BoardDay[]
  onSchedule: (choice: ScheduleChoice) => void
  message: string | null
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number>(-1)
  const visible = requests.filter((r) => matches(r, query))
  const pick: SlotPick = (day, start) => {
    const request = visible[selected]
    if (request === undefined) return
    onSchedule({
      inspectionId: request.inspectionId,
      rowVersion: request.rowVersion,
      date: day.date,
      startMinute: start,
      inspectorUserId: day.inspectorUserId,
    })
  }

  return (
    <>
      <div className="grid items-start gap-6 md:grid-cols-[22rem_1fr] [&>section]:m-0">
        <section aria-label="Requests and bookings" className="space-y-3">
          <h2 className="m-0 text-xl">Requests and bookings</h2>
          <Label htmlFor="request-search">Search requests</Label>
          <Input
            id="request-search"
            type="search"
            placeholder="Permit number, address or contact"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {visible.length === 0 ? (
            <p className="m-0">No requests are waiting.</p>
          ) : (
            <ul
              role="listbox"
              aria-label="Requests"
              className="m-0 flex list-none flex-col gap-2 p-0"
            >
              {visible.map((request, index) => (
                <li
                  key={request.inspectionId}
                  role="option"
                  aria-selected={index === selected}
                  tabIndex={0}
                  onClick={() => setSelected(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSelected(index)
                  }}
                  className={`rounded-md border p-3 ${index === selected ? 'border-ring bg-highlight' : 'border-hairline'}`}
                >
                  <p className="m-0 font-semibold">
                    <Link href={`/staff/inspections/${request.inspectionId}`}>
                      {`${request.applicationNumber}, ${request.typeLabel}`}
                    </Link>
                  </p>
                  <p className="m-0">{request.address}</p>
                  <p className="m-0 flex flex-wrap gap-2">
                    <span>{CHANNEL_LABEL[request.channel]}</span>
                    {request.isReinspection ? (
                      <span className="font-semibold">Reinspection</span>
                    ) : null}
                    {request.scheduledFor === undefined ? null : (
                      <span className="font-semibold">{`Booked ${request.scheduledFor}`}</span>
                    )}
                    {request.preferredDate === null ? null : (
                      <span>{`Prefers ${formatCivilDate(request.preferredDate)}`}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Open slots" className="space-y-3">
          <h2 className="m-0 text-xl">Open slots</h2>
          {message === null ? null : <p role="status">{message}</p>}
          {days.length === 0 ? <p className="m-0">No inspection days in this range.</p> : null}
          {days.map((day, index) => (
            <SlotDay
              key={`${day.date}-${day.inspectorUserId}`}
              day={day}
              folded={index >= OPEN_DAYS}
              onPick={pick}
            />
          ))}
        </section>
      </div>
    </>
  )
}
