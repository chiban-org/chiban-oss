'use client'

import { type FormEvent, useState } from 'react'
import type { BoardInspector } from '@/components/inspections/boardTypes'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { Button } from '@/components/ui/button'

export const OFF_GRID_TITLE = 'Book a time that is not listed'
export const REASON_LABEL = 'Reason for booking outside the town slots'
export const REASON_HINT = 'At least 10 characters. It is kept on the inspection.'

export interface OffGridSlot {
  inspectorUserId: string
  date: string
  startMinute: number
  offGridReason: string
}

function minutesOf(clock: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(clock)
  if (match === null) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function OffGridBooking({
  inspectors,
  today,
  busy,
  onBook,
}: {
  inspectors: readonly BoardInspector[]
  today: string
  busy: boolean
  onBook: (slot: OffGridSlot) => Promise<void>
}) {
  const [inspectorUserId, setInspector] = useState('')
  const [date, setDate] = useState('')
  const [clock, setClock] = useState('')
  const [reason, setReason] = useState('')
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const startMinute = minutesOf(clock)
    if (startMinute === null) return
    void onBook({ inspectorUserId, date, startMinute, offGridReason: reason })
  }
  return (
    <details className="rounded-md border border-border px-3 py-2">
      <summary className="min-h-11 cursor-pointer content-center">{OFF_GRID_TITLE}</summary>
      <form
        role="group"
        aria-label={OFF_GRID_TITLE}
        onSubmit={submit}
        className="flex flex-col gap-3 py-2"
      >
        <p className="m-0 text-muted-foreground">
          Use this for a day the town does not inspect or a time between the listed slots.
        </p>
        <SelectField
          label="Inspector"
          name="inspectorUserId"
          required
          value={inspectorUserId}
          onChange={(e) => setInspector(e.target.value)}
          options={[
            ['', 'Choose an inspector'],
            ...inspectors.map((i) => [i.userId, i.name] as const),
          ]}
        />
        <TextField
          label="Day"
          name="date"
          type="date"
          min={today}
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <TextField
          label="Start time"
          name="startMinute"
          type="time"
          required
          value={clock}
          onChange={(e) => setClock(e.target.value)}
        />
        <AreaField
          label={REASON_LABEL}
          hint={REASON_HINT}
          name="offGridReason"
          rows={2}
          required
          minLength={10}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button type="submit" variant="outline" disabled={busy} className="min-h-11 self-start">
          Book this time
        </Button>
      </form>
    </details>
  )
}
