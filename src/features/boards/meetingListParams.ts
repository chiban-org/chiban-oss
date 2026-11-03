import {
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { singleValue, whenAny } from '@/features/dataTable/quickFilters'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'

export const MEETINGS_PATH = '/staff/boards/meetings'

export const MEETING_WHEN = ['upcoming', 'past'] as const
export type MeetingWhen = (typeof MEETING_WHEN)[number]

export const MEETING_BOARDS = ['planning_board', 'zba'] as const
export type MeetingBoard = (typeof MEETING_BOARDS)[number]

export const MEETING_KINDS = ['regular', 'special'] as const
export type MeetingKind = (typeof MEETING_KINDS)[number]

export const MEETING_KIND_LABELS: ReadonlyMap<MeetingKind, string> = new Map([
  ['regular', 'Regular meeting'],
  ['special', 'Special meeting'],
])

export const AGENDA_STATES = ['none', 'draft', 'published'] as const
export type AgendaState = (typeof AGENDA_STATES)[number]

export const AGENDA_STATE_LABELS: ReadonlyMap<AgendaState, string> = new Map([
  ['none', 'Not started'],
  ['draft', 'Draft'],
  ['published', 'Published'],
])

export type MeetingSortKey = 'date' | 'board' | 'kind' | 'location' | 'hearings' | 'agenda'

const COLUMNS = {
  board: 'asc',
  kind: 'asc',
  location: 'asc',
  hearings: 'desc',
  agenda: 'asc',
} as const

export const MEETING_SORT: Record<MeetingWhen, SortConfig<MeetingSortKey>> = {
  upcoming: { defaultKey: 'date', columns: { date: 'asc', ...COLUMNS } },
  past: { defaultKey: 'date', columns: { date: 'desc', ...COLUMNS } },
}

export const MEETING_FILTER_PARAMS = ['board', 'kind', 'agenda'] as const

export interface MeetingFilters {
  boards?: MeetingBoard[]
  kinds?: MeetingKind[]
  agendas?: AgendaState[]
}

export interface MeetingListView {
  params: TableParams
  when: MeetingWhen
  sort: SortState<MeetingSortKey>
  filters: MeetingFilters
}

export function readMeetingListView(raw: RawSearchParams): MeetingListView {
  const params = readTableParams(raw)
  const when: MeetingWhen = params.get('when')?.[0] === 'past' ? 'past' : 'upcoming'
  return {
    params,
    when,
    sort: parseSort(MEETING_SORT[when], params),
    filters: {
      ...whenAny('boards', singleValue(params, 'board', MEETING_BOARDS)),
      ...whenAny('kinds', singleValue(params, 'kind', MEETING_KINDS)),
      ...whenAny('agendas', singleValue(params, 'agenda', AGENDA_STATES)),
    },
  }
}
