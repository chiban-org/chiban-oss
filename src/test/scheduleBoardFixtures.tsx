import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { vi } from 'vitest'
import type {
  BoardBooking,
  BoardDay,
  BoardInspector,
  BoardRequest,
  ScheduleChoice,
} from '@/components/inspections/boardTypes'
import { ScheduleBoard } from '@/components/inspections/ScheduleBoard'

export const BOARD_TODAY = '2027-07-06'
export const WEDNESDAY = '2027-07-07'
export const NEXT_MONDAY = '2027-07-12'

export const DANA: BoardInspector = { userId: 'u1', name: 'Dana Inspector' }
export const IRA: BoardInspector = { userId: 'u2', name: 'Ira Inspector' }

export function boardRequest(
  overrides: Partial<BoardRequest> & Pick<BoardRequest, 'inspectionId'>,
): BoardRequest {
  return {
    rowVersion: 1,
    applicationNumber: `EL-2027-${overrides.inspectionId}`,
    typeLabel: 'Rough',
    channel: 'phone',
    preferredDate: null,
    isReinspection: false,
    address: '12 Elm Road',
    contactName: 'Pat',
    ...overrides,
  }
}

export const REQUESTS: BoardRequest[] = [
  boardRequest({
    inspectionId: 'i1',
    applicationNumber: 'EL-2027-0001',
    preferredDate: WEDNESDAY,
  }),
  boardRequest({
    inspectionId: 'i2',
    rowVersion: 4,
    applicationNumber: 'BP-2027-0002',
    typeLabel: 'Framing',
    channel: 'portal',
    preferredDate: NEXT_MONDAY,
    isReinspection: true,
    address: '9 Birch Lane',
    contactName: 'Sam',
  }),
]

export function boardBooking(
  overrides: Partial<BoardBooking> & Pick<BoardBooking, 'inspectionId' | 'date' | 'startMinute'>,
): BoardBooking {
  return {
    ...boardRequest(overrides),
    inspectorUserId: DANA.userId,
    inspectorName: DANA.name,
    durationMinutes: 30,
    ...overrides,
  }
}

export const BOOKINGS: BoardBooking[] = [
  boardBooking({
    inspectionId: 'b1',
    rowVersion: 7,
    applicationNumber: 'BP-2027-0010',
    typeLabel: 'Framing',
    date: WEDNESDAY,
    startMinute: 600,
  }),
  boardBooking({
    inspectionId: 'b2',
    applicationNumber: 'MG-2027-0011',
    typeLabel: 'Insulation',
    date: WEDNESDAY,
    startMinute: 540,
  }),
  boardBooking({
    inspectionId: 'b3',
    applicationNumber: 'PL-2027-0012',
    typeLabel: 'Final',
    date: '2027-07-08',
    startMinute: 615,
    inspectorUserId: IRA.userId,
    inspectorName: IRA.name,
  }),
]

export const OWED: BoardBooking = boardBooking({
  inspectionId: 'o1',
  applicationNumber: 'EL-2027-0099',
  typeLabel: 'Service',
  date: '2027-06-29',
  startMinute: 570,
})

export function slotDay(date: string, who: BoardInspector, freeStarts: number[]): BoardDay {
  return { date, inspectorUserId: who.userId, inspectorName: who.name, freeStarts, booked: 0 }
}

export const DAYS: BoardDay[] = [
  slotDay(BOARD_TODAY, DANA, [540, 570]),
  slotDay(BOARD_TODAY, IRA, []),
  slotDay(WEDNESDAY, DANA, [570, 630]),
  slotDay(WEDNESDAY, IRA, [540, 570, 600]),
  slotDay('2027-07-09', DANA, [540]),
  slotDay('2027-07-09', IRA, [540]),
  slotDay(NEXT_MONDAY, DANA, [810]),
  slotDay(NEXT_MONDAY, IRA, [810]),
  slotDay('2027-07-16', DANA, [540]),
  slotDay('2027-07-16', IRA, [540]),
]

export interface BoardSetup {
  requests?: BoardRequest[]
  bookings?: BoardBooking[]
  days?: BoardDay[]
  inspectors?: BoardInspector[]
  onSchedule?: (choice: ScheduleChoice) => Promise<boolean>
  takeRequest?: ReactNode
  initialChosenId?: string | null
}

export function renderBoard(setup: BoardSetup = {}) {
  const onSchedule = setup.onSchedule ?? vi.fn(() => Promise.resolve(true))
  render(
    <ScheduleBoard
      requests={setup.requests ?? REQUESTS}
      bookings={setup.bookings ?? BOOKINGS}
      days={setup.days ?? DAYS}
      inspectors={setup.inspectors ?? [DANA, IRA]}
      today={BOARD_TODAY}
      takeRequest={setup.takeRequest ?? null}
      onSchedule={onSchedule}
      message={null}
      initialChosenId={setup.initialChosenId ?? null}
    />,
  )
  return onSchedule
}
