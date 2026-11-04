import { ActionForm } from '@/components/ActionForm'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { TablePager } from '@/components/dataTable/TablePager'
import { FormDialog } from '@/components/FormDialog'
import { ListHeader } from '@/components/layout/ListHeader'
import { SelectField, TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { listMeetingTable, type MeetingListPage } from '@/features/boards/meetingList'
import {
  AGENDA_STATE_LABELS,
  MEETING_BOARDS,
  MEETING_FILTER_PARAMS,
  MEETING_KIND_LABELS,
  MEETING_SORT,
  MEETINGS_PATH,
  readMeetingListView,
} from '@/features/boards/meetingListParams'
import {
  clearHref,
  pageHref,
  type RawSearchParams,
  readOffset,
  type TableParams,
} from '@/features/dataTable/params'
import { chipGroups, filterTabs, labeledOptions } from '@/features/dataTable/quickFilters'
import { sortLinks } from '@/features/dataTable/sort'
import { townToday } from '@/features/town/today'
import { requireStaffContext } from '@/server/requireStaff'
import { scheduleMeetingAction } from '../actions'
import { MeetingTable } from './MeetingTable'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

function AddMeeting({ boards }: { boards: [string, string][] }) {
  return (
    <FormDialog label="Add meeting" title="Add a meeting" variant="default">
      <ActionForm action={scheduleMeetingAction} submitLabel="Add meeting" className="max-w-md">
        <SelectField label="Board" name="board" options={boards} />
        <TextField label="Date" name="meetingDate" type="date" required />
        <SelectField
          label="Kind"
          name="kind"
          options={[
            ['regular', 'Regular meeting'],
            ['special', 'Special meeting'],
          ]}
        />
        <TextField label="Location" name="location" />
      </ActionForm>
    </FormDialog>
  )
}

function chips(
  params: TableParams,
  list: MeetingListPage,
  boardNames: ReadonlyMap<string, string>,
) {
  return chipGroups(MEETINGS_PATH, params, [
    {
      param: 'board',
      label: 'Board',
      single: true,
      display: 'inline',
      options: labeledOptions(boardNames, list.facets.get('boards')),
    },
    {
      param: 'kind',
      label: 'Kind',
      single: true,
      options: labeledOptions(MEETING_KIND_LABELS, list.facets.get('kinds')),
    },
    {
      param: 'agenda',
      label: 'Agenda',
      single: true,
      options: labeledOptions(AGENDA_STATE_LABELS, list.facets.get('agendas')),
    },
  ])
}

function leadText(upcoming: boolean, usual: string): string {
  const order = upcoming ? 'Upcoming meetings, soonest first.' : 'Past meetings, most recent first.'
  const place = usual === '' ? '' : ` Meetings are at ${usual} unless the table says otherwise.`
  return `${order}${place} Adding or cancelling a regular meeting recalculates the completeness dates that depend on it.`
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, when, sort, filters } = readMeetingListView(await searchParams)
  const ctx = await requireStaffContext()
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const list = await listMeetingTable(
    ctx.db,
    ctx.actor,
    { when, today, sort, filters, limit: PAGE_SIZE, offset: readOffset(params) },
    ctx.signal,
  )
  if (list === null) return <NoPermission title="Meetings" action="keep the meeting calendar" />
  const settings = await getBoardSettings(ctx.db, ctx.signal)
  const boardNames = new Map(MEETING_BOARDS.map((b) => [b, boardLabel(settings, b)]))
  const tabs = filterTabs(MEETINGS_PATH, params, {
    param: 'when',
    label: 'Meetings',
    defaultTab: 'upcoming',
    options: [
      { value: 'upcoming', label: 'Upcoming', count: list.counts.get('upcoming') ?? 0 },
      { value: 'past', label: 'Past', count: list.counts.get('past') ?? 0 },
    ],
  })
  const clear = clearHref(MEETINGS_PATH, params, MEETING_FILTER_PARAMS)
  const pageLink = (offset: number | null) =>
    offset === null ? null : pageHref(MEETINGS_PATH, params, String(offset))
  return (
    <main data-wide="">
      <ListHeader
        title="Meetings"
        lead={leadText(when === 'upcoming', list.usualLocation)}
        actions={<AddMeeting boards={[...boardNames]} />}
      />
      <FilterTabs label="Meetings" tabs={tabs} />
      <div className="toolbar">
        <QuickFilters
          label="Quick filters"
          groups={chips(params, list, boardNames)}
          clearHref={clear}
        />
      </div>
      <div className="table-panel">
        {list.rows.length === 0 ? (
          <p className="px-5 py-8">
            {clear !== null
              ? 'No meeting matches these filters.'
              : when === 'upcoming'
                ? 'No upcoming meetings. Add the next one with Add meeting.'
                : 'No past meetings yet.'}
          </p>
        ) : (
          <MeetingTable
            rows={list.rows}
            links={sortLinks(MEETINGS_PATH, params, MEETING_SORT[when], sort)}
            boardNames={boardNames}
            usualLocation={list.usualLocation}
            upcoming={when === 'upcoming'}
          />
        )}
      </div>
      <TablePager
        offset={list.offset}
        shown={list.rows.length}
        total={list.total}
        prevHref={pageLink(list.prevOffset)}
        nextHref={pageLink(list.nextOffset)}
      />
    </main>
  )
}
