import type { Metadata } from 'next'
import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'
import { ListHeader } from '@/components/layout/ListHeader'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { clearHref, pageHref, type RawSearchParams, readOffset } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { RTK_STATUS_LABELS } from '@/features/rtk/labels'
import { listRtkRequestPage, rtkRequestFacets } from '@/features/rtk/requestList'
import { requestChipGroups } from '@/features/rtk/requestListChips'
import {
  REQUEST_FILTER_PARAMS,
  REQUEST_SORT,
  REQUESTS_PATH,
  readRequestsView,
} from '@/features/rtk/requestListParams'
import { requestRowChipStatus } from '@/features/rtk/requestStatus'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { LogRequest } from './LogRequestForm'

export const metadata: Metadata = { title: 'Right-to-Know requests' }

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

export default async function RightToKnowLogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort, filters } = readRequestsView(await searchParams)
  const ctx = await requireStaffContext()
  if (!mayOpen(REQUESTS_PATH, await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Right-to-Know requests" action="see Right-to-Know requests" />
  }
  const today = await townToday(ctx.db, new Date(), ctx.signal)
  const [list, facets] = await Promise.all([
    listRtkRequestPage(
      ctx.db,
      ctx.actor,
      { filters, sort, limit: PAGE_SIZE, offset: readOffset(params), today },
      ctx.signal,
    ),
    rtkRequestFacets(ctx.db, ctx.actor, { filters, today }, ctx.signal),
  ])
  const links = sortLinks(REQUESTS_PATH, params, REQUEST_SORT, sort)
  const clear = clearHref(REQUESTS_PATH, params, REQUEST_FILTER_PARAMS)
  const pageLink = (offset: number | null) =>
    offset === null ? null : pageHref(REQUESTS_PATH, params, String(offset))
  return (
    <main data-wide="">
      <ListHeader
        title="Right-to-Know requests"
        lead="Soonest next date first. Requests with no date running come last."
        actions={<LogRequest today={today} />}
      />
      <div className="toolbar">
        <QuickFilters
          label="Quick filters"
          groups={requestChipGroups(params, facets)}
          clearHref={clear}
        />
      </div>
      <div className="table-panel">
        {list.rows.length === 0 ? (
          <p className="px-5 py-8">No requests match.</p>
        ) : (
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr>
                <SortHeader label="Request" link={links.number} />
                <SortHeader label="What was asked for" link={links.asked} />
                <SortHeader label="Received" link={links.received} />
                <SortHeader label="Status" link={links.status} />
                <SortHeader label="Next date" link={links.due} />
              </tr>
            </thead>
            <tbody>
              {list.rows.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap">
                    <Link href={`/staff/records/requests/${row.id}`}>{row.number}</Link>
                  </td>
                  <td>{row.description}</td>
                  <td className="whitespace-nowrap">{formatCivilDate(row.receivedOn)}</td>
                  <td>
                    <StatusChip
                      status={requestRowChipStatus(
                        row.status,
                        row.dueOn !== null && row.dueOn < today,
                      )}
                      label={RTK_STATUS_LABELS[row.status]}
                    />
                  </td>
                  <td>
                    {row.dueOn === null
                      ? ''
                      : `${formatCivilDate(row.dueOn)}${row.dueOn < today ? ' (past due)' : ''}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
