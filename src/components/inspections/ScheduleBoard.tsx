'use client'

import { useEffect, useRef, useState } from 'react'
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

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
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
  const focusedSlot = useRef<{ date: string; inspectorUserId: string; startMinute: number } | null>(
    null,
  )
  const search = useRef<HTMLInputElement>(null)
  const visible = requests.filter((r) => matches(r, query))
  const state = useRef({ visible, selected, onSchedule })
  state.current = { visible, selected, onSchedule }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      const { visible: list, selected: index, onSchedule: schedule } = state.current
      if (event.key === '/') {
        event.preventDefault()
        search.current?.focus()
      } else if (event.key === 'j') {
        setSelected(Math.min(index + 1, list.length - 1))
      } else if (event.key === 'k') {
        setSelected(Math.max(index - 1, 0))
      } else if (event.key === 's') {
        const request = list[index]
        const slot = focusedSlot.current
        if (request === undefined || slot === null) return
        schedule({
          inspectionId: request.inspectionId,
          rowVersion: request.rowVersion,
          date: slot.date,
          startMinute: slot.startMinute,
          inspectorUserId: slot.inspectorUserId,
        })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="grid items-start gap-6 md:grid-cols-[22rem_1fr] [&>section]:m-0">
      <section aria-label="Requests and bookings" className="space-y-3">
        <h2 className="m-0 text-xl">Requests and bookings</h2>
        <input
          ref={search}
          type="search"
          aria-label="Search requests"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-10 w-full rounded-md border bg-surface px-3"
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
                <p className="m-0 font-semibold">{`${request.applicationNumber}, ${request.typeLabel}`}</p>
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
        <p className="m-0 text-muted-foreground">
          Press j or k to choose a request, focus a slot, then press s to schedule it. Press / to
          search.
        </p>
        {message === null ? null : <p role="status">{message}</p>}
        {days.length === 0 ? <p className="m-0">No inspection days in this range.</p> : null}
        {days.map((day) => (
          <div key={`${day.date}-${day.inspectorUserId}`} className="border-t pt-3">
            <p className="m-0 font-semibold">{formatCivilDate(day.date)}</p>
            <p className="m-0 text-muted-foreground">{day.inspectorName}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {day.freeStarts.length === 0 ? <span>Full</span> : null}
              {day.freeStarts.map((start) => (
                <button
                  key={start}
                  type="button"
                  aria-label={`${minutesToClock(start)}, ${formatCivilDate(day.date)}, ${day.inspectorName}`}
                  onFocus={() => {
                    focusedSlot.current = {
                      date: day.date,
                      inspectorUserId: day.inspectorUserId,
                      startMinute: start,
                    }
                  }}
                  onClick={() => {
                    const request = visible[selected]
                    if (request === undefined) return
                    onSchedule({
                      inspectionId: request.inspectionId,
                      rowVersion: request.rowVersion,
                      date: day.date,
                      startMinute: start,
                      inspectorUserId: day.inspectorUserId,
                    })
                  }}
                  className="rounded-md border border-control-border px-3 py-1.5 tabular-nums hover:bg-canvas"
                >
                  {minutesToClock(start)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
