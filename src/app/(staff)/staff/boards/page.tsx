import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { arrangeBoardLines, boardFacets } from '@/features/boards/boardApplicationList'
import { boardChipGroups } from '@/features/boards/boardListChips'
import {
  BOARD_FILTER_PARAMS,
  BOARD_SORT,
  BOARDS_PATH,
  type BoardSortKey,
  readBoardsListView,
} from '@/features/boards/boardListParams'
import {
  type BoardApplicationLine,
  type BoardSection,
  loadBoardsView,
} from '@/features/boards/boardsView'
import { clearHref, type RawSearchParams } from '@/features/dataTable/params'
import { type SortLink, sortLinks } from '@/features/dataTable/sort'
import { requireStaffContext } from '@/server/requireStaff'
import type { CivilDate } from '@/types/civilDate'

export const dynamic = 'force-dynamic'

function SectionApplications({
  section,
  lines,
  links,
  filtered,
}: {
  section: BoardSection
  lines: BoardApplicationLine[]
  links: Record<BoardSortKey, SortLink>
  filtered: boolean
}) {
  if (section.applications.length === 0) return <p>No applications are waiting on this board.</p>
  if (lines.length === 0) {
    return <p>{filtered ? 'No applications in this section match these filters.' : 'None.'}</p>
  }
  return (
    <div className="table-panel">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">{`Applications before the ${section.label}`}</caption>
        <thead>
          <tr>
            <SortHeader label="Application" link={links.application} />
            <SortHeader label="Status" link={links.status} />
            <SortHeader label="Filed" link={links.filed} />
            <SortHeader label="Meeting" link={links.meeting} />
            <SortHeader label="Next deadline" link={links.deadline} />
          </tr>
        </thead>
        <tbody>
          {lines.map((a) => (
            <tr key={a.id} className="align-top">
              <td>
                <Link href={`/staff/applications/${a.id}`} className="text-action underline">
                  {a.number}
                </Link>
                <br />
                {a.typeLabel}
              </td>
              <td>{a.stateText}</td>
              <td>{a.filedText}</td>
              <td>{a.meetingText ?? 'Not set'}</td>
              <td>{a.deadlineText ?? 'None running'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function BoardsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort, filters } = readBoardsListView(await searchParams)
  const ctx = await requireStaffContext()
  const view = await loadBoardsView(ctx.db, ctx.actor, ctx.signal)
  if (view === null) return <NoPermission title="Boards" action="work with the boards" />
  const today = view.today as CivilDate
  const allLines = view.sections.flatMap((section) => section.applications)
  const links = sortLinks(BOARDS_PATH, params, BOARD_SORT, sort)
  const clear = clearHref(BOARDS_PATH, params, BOARD_FILTER_PARAMS)
  return (
    <main className="space-y-8">
      <h1>Boards</h1>
      <p>
        <Link href="/staff/boards/meetings" className="text-action underline">
          Meeting calendar
        </Link>{' '}
        <Link href="/staff/boards/packets" className="text-action underline">
          Board packets
        </Link>{' '}
        <Link href="/staff/rosters" className="text-action underline">
          Rosters
        </Link>{' '}
        <Link href="/staff/boards/members" className="text-action underline">
          Board members
        </Link>
      </p>
      {allLines.length === 0 ? null : (
        <div className="toolbar">
          <QuickFilters
            label="Quick filters"
            groups={boardChipGroups(params, boardFacets(allLines, filters, today))}
            clearHref={clear}
          />
        </div>
      )}
      {view.sections.map((section) => (
        <section key={section.board} aria-label={section.label} className="space-y-3">
          <h2>{section.label}</h2>
          <SectionApplications
            section={section}
            lines={arrangeBoardLines(section.applications, sort, filters, today)}
            links={links}
            filtered={clear !== null}
          />
        </section>
      ))}
    </main>
  )
}
