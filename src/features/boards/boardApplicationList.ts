import { CORE_STATES } from '@/features/applications/states'
import type { BoardFilters, BoardSortKey } from '@/features/boards/boardListParams'
import type { BoardApplicationLine } from '@/features/boards/boardsView'
import type { SortState } from '@/features/dataTable/sort'
import { DUE_FILTERS, type DueFilter } from '@/features/queue/queueParams'
import { type SortValue, sortRanked } from '@/lib/sortRanked'
import { addDays, type CivilDate } from '@/types/civilDate'

const DUE_WEEK_DAYS = 7

export interface BoardFacets {
  due: ReadonlyMap<string, number>
  types: { value: string; label: string; count: number }[]
}

function dueMatches(line: BoardApplicationLine, value: DueFilter, today: CivilDate): boolean {
  switch (value) {
    case 'overdue':
      return line.deadlineOverdue
    case 'week':
      return (
        !line.deadlineOverdue &&
        line.deadlineOn !== null &&
        line.deadlineOn >= today &&
        line.deadlineOn <= addDays(today, DUE_WEEK_DAYS)
      )
    case 'none':
      return line.deadlineOn === null
  }
}

function matches(
  line: BoardApplicationLine,
  filters: BoardFilters,
  today: CivilDate,
  except?: 'due' | 'types',
): boolean {
  const due = filters.due ?? []
  const types = filters.typeKeys ?? []
  const dueOk =
    except === 'due' || due.length === 0 || due.some((value) => dueMatches(line, value, today))
  const typeOk = except === 'types' || types.length === 0 || types.includes(line.typeKey)
  return dueOk && typeOk
}

function sortValue(line: BoardApplicationLine, key: BoardSortKey): SortValue {
  switch (key) {
    case 'application':
      return line.number
    case 'status':
      return CORE_STATES.indexOf(line.state)
    case 'filed':
      return line.filedOn
    case 'meeting':
      return line.meetingOn
    case 'deadline':
      return line.deadlineOn
  }
}

export function arrangeBoardLines(
  lines: readonly BoardApplicationLine[],
  sort: SortState<BoardSortKey>,
  filters: BoardFilters,
  today: CivilDate,
): BoardApplicationLine[] {
  return sortRanked(
    lines.filter((line) => matches(line, filters, today)),
    sort.dir,
    (line) => sortValue(line, sort.key),
  )
}

export function boardFacets(
  lines: readonly BoardApplicationLine[],
  filters: BoardFilters,
  today: CivilDate,
): BoardFacets {
  const dueCount = (value: DueFilter) =>
    lines.filter((line) => matches(line, filters, today, 'due') && dueMatches(line, value, today))
      .length
  const labels = new Map(lines.map((line) => [line.typeKey, line.typeLabel]))
  return {
    due: new Map(DUE_FILTERS.map((value) => [value, dueCount(value)])),
    types: [...labels]
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([value, label]) => ({
        value,
        label,
        count: lines.filter(
          (line) => matches(line, filters, today, 'types') && line.typeKey === value,
        ).length,
      })),
  }
}
