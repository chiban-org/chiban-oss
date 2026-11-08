import { BOARD_KIND_TRAITS } from '@packs/nh/boardSchema'
import type { Metadata } from 'next'
import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { applicationChipStatus } from '@/features/applications/chipStatus'
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
  type CommentRequestLine,
  loadBoardsView,
} from '@/features/boards/boardsView'
import { clearHref, type RawSearchParams } from '@/features/dataTable/params'
import { type SortLink, sortLinks } from '@/features/dataTable/sort'
import { requireStaffContext } from '@/server/requireStaff'
import type { CivilDate } from '@/types/civilDate'

export const metadata: Metadata = { title: 'Board applications' }

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
                <Link href={`/staff/applications/${a.id}`}>{a.number}</Link>
                <br />
                {a.typeLabel}
              </td>
              <td>
                <StatusChip status={applicationChipStatus(a.state)} label={a.stateText} />
              </td>
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

function CommentRequests({ section }: { section: BoardSection }) {
  const requests: CommentRequestLine[] = section.commentRequests
  if (requests.length === 0) {
    if (BOARD_KIND_TRAITS[section.boardKind].decidesApplications) return null
    return (
      <p>
        This board comments on applications and does not decide them. Nothing has been sent to it
        for comment.
      </p>
    )
  }
  return (
    <>
      <h3>Sent for comment</h3>
      <ul className="flex flex-col gap-3">
        {requests.map((r) => (
          <li key={r.applicationId}>
            <Link href={`/staff/applications/${r.applicationId}`}>{r.number}</Link>, {r.title}
            <br />
            {r.statusLabel}.{r.commentByText === null ? '' : ` Comments by ${r.commentByText}.`}
          </li>
        ))}
      </ul>
    </>
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
  if (view === null)
    return <NoPermission title="Board applications" action="work with the boards" />
  const today = view.today as CivilDate
  const allLines = view.sections.flatMap((section) => section.applications)
  const links = sortLinks(BOARDS_PATH, params, BOARD_SORT, sort)
  const clear = clearHref(BOARDS_PATH, params, BOARD_FILTER_PARAMS)
  return (
    <main data-wide="">
      <h1>Board applications</h1>
      <p>
        Applications before each board that are submitted, under review, or decided, oldest filing
        first.
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
        <section key={section.boardId} aria-label={section.label}>
          <h2>{section.label}</h2>
          {BOARD_KIND_TRAITS[section.boardKind].decidesApplications ? (
            <SectionApplications
              section={section}
              lines={arrangeBoardLines(section.applications, sort, filters, today)}
              links={links}
              filtered={clear !== null}
            />
          ) : null}
          <CommentRequests section={section} />
        </section>
      ))}
    </main>
  )
}
