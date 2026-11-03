import { describe, expect, it } from 'vitest'
import { arrangeBoardLines, boardFacets } from '@/features/boards/boardApplicationList'
import type { BoardSortKey } from '@/features/boards/boardListParams'
import type { BoardApplicationLine } from '@/features/boards/boardsView'
import type { CivilDate } from '@/types/civilDate'

const TODAY = '2027-03-02' as CivilDate

function line(id: string, patch: Partial<BoardApplicationLine> = {}): BoardApplicationLine {
  return {
    id,
    number: id,
    typeLabel: 'Site plan',
    stateText: '',
    filedText: '',
    meetingText: null,
    deadlineText: null,
    typeKey: 'site_plan',
    state: 'submitted',
    filedOn: null,
    meetingOn: null,
    deadlineOn: null,
    deadlineOverdue: false,
    ...patch,
  }
}

const lines = [
  line('PB-3', {
    filedOn: '2027-02-10',
    meetingOn: '2027-03-20',
    deadlineOn: '2027-03-05',
    state: 'under_review',
  }),
  line('PB-1', {
    filedOn: '2027-01-05',
    deadlineOn: '2027-02-20',
    deadlineOverdue: true,
    typeKey: 'subdivision',
    typeLabel: 'Subdivision',
  }),
  line('PB-2', { filedOn: null, meetingOn: '2027-03-10', state: 'decided' }),
  line('PB-4', { filedOn: '2027-02-10', deadlineOn: '2027-04-30' }),
]
const ids = (items: BoardApplicationLine[]) => items.map((l) => l.id)
const by = (key: BoardSortKey, dir: 'asc' | 'desc') => ({ key, dir })

describe('board application sorting', () => {
  it('sorts by filed date with unfiled applications last and the listed order inside a tie', () => {
    expect(ids(arrangeBoardLines(lines, by('filed', 'asc'), {}, TODAY))).toEqual([
      'PB-1',
      'PB-3',
      'PB-4',
      'PB-2',
    ])
    expect(ids(arrangeBoardLines(lines, by('filed', 'desc'), {}, TODAY))).toEqual([
      'PB-3',
      'PB-4',
      'PB-1',
      'PB-2',
    ])
  })

  it('sorts by application number', () => {
    expect(ids(arrangeBoardLines(lines, by('application', 'asc'), {}, TODAY))).toEqual([
      'PB-1',
      'PB-2',
      'PB-3',
      'PB-4',
    ])
  })

  it('sorts by status in workflow order', () => {
    expect(ids(arrangeBoardLines(lines, by('status', 'asc'), {}, TODAY))).toEqual([
      'PB-1',
      'PB-4',
      'PB-3',
      'PB-2',
    ])
  })

  it('sorts by meeting and by deadline with none last both ways', () => {
    expect(ids(arrangeBoardLines(lines, by('meeting', 'asc'), {}, TODAY))).toEqual([
      'PB-2',
      'PB-3',
      'PB-1',
      'PB-4',
    ])
    expect(ids(arrangeBoardLines(lines, by('deadline', 'desc'), {}, TODAY))).toEqual([
      'PB-4',
      'PB-3',
      'PB-1',
      'PB-2',
    ])
  })
})

describe('board application quick filters', () => {
  const filed = by('filed', 'asc')

  it('filters overdue, due this week and no deadline', () => {
    expect(ids(arrangeBoardLines(lines, filed, { due: ['overdue'] }, TODAY))).toEqual(['PB-1'])
    expect(ids(arrangeBoardLines(lines, filed, { due: ['week'] }, TODAY))).toEqual(['PB-3'])
    expect(ids(arrangeBoardLines(lines, filed, { due: ['none'] }, TODAY))).toEqual(['PB-2'])
  })

  it('ORs values inside the deadline group', () => {
    expect(ids(arrangeBoardLines(lines, filed, { due: ['overdue', 'none'] }, TODAY))).toEqual([
      'PB-1',
      'PB-2',
    ])
  })

  it('filters by type and ANDs the groups', () => {
    expect(ids(arrangeBoardLines(lines, filed, { typeKeys: ['subdivision'] }, TODAY))).toEqual([
      'PB-1',
    ])
    expect(
      ids(arrangeBoardLines(lines, filed, { typeKeys: ['subdivision'], due: ['week'] }, TODAY)),
    ).toEqual([])
  })

  it('counts every chip with the other group applied and lists each type present', () => {
    const all = boardFacets(lines, {}, TODAY)
    expect(all.due.get('overdue')).toBe(1)
    expect(all.due.get('none')).toBe(1)
    expect(all.types).toEqual([
      { value: 'site_plan', label: 'Site plan', count: 3 },
      { value: 'subdivision', label: 'Subdivision', count: 1 },
    ])
    const narrowed = boardFacets(lines, { typeKeys: ['subdivision'] }, TODAY)
    expect(narrowed.due.get('overdue')).toBe(1)
    expect(narrowed.due.get('week')).toBe(0)
    expect(narrowed.types.map((t) => t.count)).toEqual([3, 1])
  })
})
