import type { ReactNode } from 'react'
import type { BoardBooking, BoardDay, BoardInspector } from '@/components/inspections/boardTypes'
import type { CellContext } from '@/components/inspections/GridCell'

export interface BoardView {
  dates: string[]
  rows: BoardInspector[]
  days: BoardDay[]
  bookings: BoardBooking[]
  today: string
  preferred: string | null
  review: { inspectorUserId: string; date: string; node: ReactNode } | null
  context: CellContext
}

export function dayFor(view: BoardView, date: string, inspectorUserId: string) {
  return view.days.find((d) => d.date === date && d.inspectorUserId === inspectorUserId)
}
