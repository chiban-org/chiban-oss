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
}

export interface BoardBooking extends BoardRequest {
  inspectorUserId: string
  inspectorName: string
  date: string
  startMinute: number
  durationMinutes: number
}

export type BoardItem = BoardRequest | BoardBooking

export interface BoardDay {
  date: string
  inspectorUserId: string
  inspectorName: string
  freeStarts: number[]
  booked: number
}

export interface BoardInspector {
  userId: string
  name: string
}

export interface ScheduleChoice {
  inspectionId: string
  rowVersion: number
  date: string
  startMinute: number
  inspectorUserId: string
  offGridReason?: string
}

export interface PickedTime {
  day: BoardDay
  start: number
}

export function isBooking(item: BoardItem): item is BoardBooking {
  return 'startMinute' in item
}

export function cellKey(date: string, inspectorUserId: string): string {
  return `${date}|${inspectorUserId}`
}
