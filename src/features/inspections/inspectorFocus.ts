import type { InspectionRow } from '@/db/schema'
import { formatCivilDate } from '@/lib/formatDate'
import { inspectionTypeLabel } from './siteInfo'
import { minutesToClock } from './zonedTime'

export type FocusRow = Pick<
  InspectionRow,
  | 'id'
  | 'status'
  | 'inspectionType'
  | 'reinspectionOf'
  | 'inspectorUserId'
  | 'scheduledDate'
  | 'startMinute'
  | 'resultRecordedAt'
>

function slotKey(row: FocusRow): string {
  return `${row.scheduledDate ?? '9999-12-31'} ${String(row.startMinute ?? 0).padStart(4, '0')}`
}

export function nextScheduled<T extends FocusRow>(rows: readonly T[]): T | null {
  const scheduled = rows.filter((r) => r.status === 'scheduled')
  return [...scheduled].sort((a, b) => slotKey(a).localeCompare(slotKey(b)))[0] ?? null
}

export function lastResult<T extends FocusRow>(rows: readonly T[]): T | null {
  const recorded = rows.filter((r) => r.status === 'passed' || r.status === 'failed')
  return (
    [...recorded].sort(
      (a, b) => (b.resultRecordedAt?.getTime() ?? 0) - (a.resultRecordedAt?.getTime() ?? 0),
    )[0] ?? null
  )
}

export function inspectionName(row: FocusRow): string {
  const kind = row.reinspectionOf === null ? 'inspection' : 'reinspection'
  return `${inspectionTypeLabel(row.inspectionType)} ${kind}`
}

function at(row: FocusRow): string {
  return row.startMinute === null ? '' : ` at ${minutesToClock(row.startMinute)}`
}

export function slotText(row: FocusRow, today: string): string {
  if (row.scheduledDate === null) return 'No date set'
  const day = row.scheduledDate === today ? 'Today' : formatCivilDate(row.scheduledDate)
  return `${day}${at(row)}`
}

export function whenPhrase(row: FocusRow, today: string): string {
  const date = row.scheduledDate
  if (date === null) return 'has no date yet'
  if (date === today) return `today${at(row)}`
  if (date < today) return `from ${formatCivilDate(date)} needs its result`
  return `on ${formatCivilDate(date)}${at(row)}`
}

function who(row: FocusRow, viewerId: string, name: string | null): string {
  if (row.inspectorUserId === viewerId) return 'Inspector (you)'
  return name === null ? 'Inspector' : `Inspector (${name})`
}

export function inspectorSentence(input: {
  rows: readonly FocusRow[]
  today: string
  viewerId: string
  inspectorName: string | null
}): string {
  const next = nextScheduled(input.rows)
  if (next !== null) {
    const waiting = who(next, input.viewerId, input.inspectorName)
    return `Waiting on: ${waiting}. ${inspectionName(next)} ${whenPhrase(next, input.today)}.`
  }
  const requested = input.rows.find((r) => r.status === 'requested')
  if (requested !== undefined) return `Waiting on: Town. Schedule the ${inspectionName(requested)}.`
  return 'No inspection is scheduled or requested.'
}
