'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import { boardWeeks, focusDate, focusWeek, weekDates } from '@/components/inspections/boardModel'
import type {
  BoardBooking,
  BoardDay,
  BoardItem,
  BoardRequest,
  PickedTime,
  ScheduleChoice,
} from '@/components/inspections/boardTypes'
import type { SlotPick } from '@/components/inspections/SlotWeeks'
import { firstOpenWeek } from '@/features/inspections/slotWeeks'
import type { CivilDate } from '@/types/civilDate'

const NARROW = '(max-width: 1023px)'

function isNarrow(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches
}

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, () => false)
}

export interface BoardInput {
  requests: BoardRequest[]
  bookings: BoardBooking[]
  days: BoardDay[]
  today: string
  onSchedule: (choice: ScheduleChoice) => Promise<boolean>
  initialChosenId: string | null
}

export function useScheduleBoard(input: BoardInput) {
  const { requests, bookings, days, today, onSchedule } = input
  const all: BoardItem[] = [...bookings, ...requests]
  const weeks = boardWeeks(days, bookings, today)
  const initial = all.find((r) => r.inspectionId === input.initialChosenId)
  const [chosenId, setChosenId] = useState<string | null>(initial?.inspectionId ?? null)
  const [picked, setPicked] = useState<PickedTime | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [booking, setBooking] = useState(false)
  const [shown, setShown] = useState<CivilDate | null>(
    () => focusWeek(initial, weeks) ?? firstOpenWeek(weeks),
  )
  const [dayShown, setDayShown] = useState<string | null>(() => focusDate(initial))
  const promptRef = useRef<HTMLParagraphElement | null>(null)
  const chosen = all.find((r) => r.inspectionId === chosenId)
  const week = weeks.find((w) => w.start === shown) ?? weeks[0]
  const dates = weekDates(week)
  const narrowDay = dayShown !== null && dates.includes(dayShown) ? dayShown : dates[0]

  const reset = () => {
    setPicked(null)
    setExpanded(null)
  }
  const choose = (item: BoardItem) => {
    setChosenId(item.inspectionId)
    reset()
    const target = focusWeek(item, weeks)
    if (target !== null) setShown(target)
    setDayShown(focusDate(item))
    if (isNarrow()) promptRef.current?.focus()
  }
  const showWeek = (start: CivilDate) => {
    reset()
    setShown(start)
  }
  const showDay = (date: string) => {
    reset()
    setDayShown(date)
  }
  const toggle = (key: string) => {
    setPicked(null)
    setExpanded((current) => (current === key ? null : key))
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
    reset()
    setChosenId((current) => (current === chosen.inspectionId ? null : current))
  }

  return {
    weeks,
    week,
    dates,
    narrowDay,
    chosen,
    chosenId,
    picked,
    expanded,
    booking,
    promptRef,
    choose,
    showWeek,
    showDay,
    toggle,
    pick,
    book,
    cancelPick: () => setPicked(null),
  }
}
