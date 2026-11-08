'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { gridRows, promptText, upcoming, waitingItems } from '@/components/inspections/boardModel'
import type {
  BoardBooking,
  BoardDay,
  BoardInspector,
  BoardItem,
  BoardRequest,
  ScheduleChoice,
} from '@/components/inspections/boardTypes'
import { cellKey } from '@/components/inspections/boardTypes'
import type { BoardView } from '@/components/inspections/boardView'
import { NarrowDay } from '@/components/inspections/NarrowDay'
import { ReviewRow } from '@/components/inspections/ReviewRow'
import { WeekSwitcher } from '@/components/inspections/SlotWeeks'
import { useNarrow, useScheduleBoard } from '@/components/inspections/useScheduleBoard'
import { WaitingRow } from '@/components/inspections/WaitingRow'
import { WeekGrid } from '@/components/inspections/WeekGrid'

export type {
  BoardBooking,
  BoardDay,
  BoardInspector,
  BoardRequest,
  ScheduleChoice,
} from '@/components/inspections/boardTypes'

function ChoicePrompt({
  chosen,
  today,
  promptRef,
}: {
  chosen: BoardItem | undefined
  today: string
  promptRef: React.RefObject<HTMLParagraphElement | null>
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
      <p
        ref={promptRef}
        tabIndex={-1}
        data-testid="choice-prompt"
        className={chosen === undefined ? 'm-0 text-muted-foreground' : 'm-0 font-semibold'}
      >
        {promptText(chosen, today)}
      </p>
      {chosen === undefined ? null : (
        <Link href={`/staff/inspections/${chosen.inspectionId}`}>View the inspection</Link>
      )}
    </div>
  )
}

type Board = ReturnType<typeof useScheduleBoard>

function reviewOf(board: Board): BoardView['review'] {
  const { picked } = board
  if (picked === null) return null
  return {
    inspectorUserId: picked.day.inspectorUserId,
    date: picked.day.date,
    node: (
      <ReviewRow
        picked={picked}
        booking={board.booking}
        onBook={() => void board.book()}
        onCancel={board.cancelPick}
      />
    ),
  }
}

function boardView(
  board: Board,
  data: { days: BoardDay[]; bookings: BoardBooking[]; inspectors: BoardInspector[]; today: string },
): BoardView {
  const ahead = upcoming(data.bookings, data.today)
  return {
    dates: board.dates,
    rows: gridRows(data.inspectors, ahead),
    days: data.days,
    bookings: ahead,
    today: data.today,
    preferred: board.chosen?.preferredDate ?? null,
    review: reviewOf(board),
    context: {
      chosenId: board.chosenId,
      canPick: board.chosen !== undefined && !board.booking,
      busy: board.booking,
      expanded: board.expanded,
      picked:
        board.picked === null
          ? null
          : {
              key: cellKey(board.picked.day.date, board.picked.day.inspectorUserId),
              start: board.picked.start,
            },
      onToggle: board.toggle,
      onPick: board.pick,
      onChoose: board.choose,
    },
  }
}

function Schedule({
  board,
  view,
  message,
}: {
  board: Board
  view: BoardView
  message: string | null
}) {
  const narrow = useNarrow()
  const { week, narrowDay } = board
  let body: ReactNode = <p>No inspection days in this range.</p>
  if (week !== undefined && narrowDay !== undefined) {
    body = narrow ? (
      <NarrowDay view={view} shown={narrowDay} onShowDay={board.showDay} />
    ) : (
      <WeekGrid view={view} label={`Bookings and open times, ${week.label}`} />
    )
  }
  return (
    <section aria-label="Schedule" className="m-0 min-w-0">
      <ChoicePrompt chosen={board.chosen} today={view.today} promptRef={board.promptRef} />
      {week === undefined ? null : (
        <WeekSwitcher weeks={board.weeks} shown={week.start} onShow={board.showWeek} />
      )}
      {message === null ? null : <p role="status">{message}</p>}
      {body}
    </section>
  )
}

export function ScheduleBoard({
  requests,
  bookings,
  days,
  inspectors,
  today,
  takeRequest = null,
  onSchedule,
  message,
  initialChosenId = null,
}: {
  requests: BoardRequest[]
  bookings: BoardBooking[]
  days: BoardDay[]
  inspectors: BoardInspector[]
  today: string
  takeRequest?: ReactNode
  onSchedule: (choice: ScheduleChoice) => Promise<boolean>
  message: string | null
  initialChosenId?: string | null
}) {
  const board = useScheduleBoard({ requests, bookings, days, today, onSchedule, initialChosenId })
  const view = boardView(board, { days, bookings, inspectors, today })
  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] [&>section]:m-0">
        {takeRequest}
        <WaitingRow
          items={waitingItems(requests, bookings, today)}
          today={today}
          chosenId={board.chosenId}
          onChoose={board.choose}
        />
      </div>
      <Schedule board={board} view={view} message={message} />
    </div>
  )
}
