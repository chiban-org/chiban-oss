import Link from 'next/link'
import { ApplicationStatusChip } from '@/components/ApplicationStatusChip'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'
import { NoPermission } from '@/components/staff/NoPermission'
import {
  listStaffApplications,
  type StaffApplicationRow,
  staffApplicationFacets,
} from '@/features/applications/staffList'
import {
  applicationChipGroups,
  applicationStatusTabs,
} from '@/features/applications/staffListChips'
import {
  APPLICATION_FILTER_PARAMS,
  APPLICATION_SORT,
  APPLICATIONS_PATH,
  readApplicationsView,
} from '@/features/applications/staffListParams'
import type { CoreState } from '@/features/applications/states'
import { substepLabelsFor } from '@/features/applications/substepLabels'
import { clearHref, pageHref, type RawSearchParams, readOffset } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { displayIdsFor } from '@/features/parcels/displayId'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'
import { formatCivilDateShort } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'

const PAGE_SIZE = 25

interface Props {
  searchParams: Promise<RawSearchParams>
}

function Row({
  row,
  parcel,
  substepLabel,
}: {
  row: StaffApplicationRow
  parcel: string | undefined
  substepLabel: string | undefined
}) {
  return (
    <tr>
      <td>
        <Link href={`/staff/applications/${row.id}`} className="whitespace-nowrap font-semibold">
          {row.number}
        </Link>
      </td>
      <td>{row.projectTitle}</td>
      <td>
        <Link href={`/staff/parcels/${row.parcelId}`} className="tabular-nums">
          {parcel ?? 'No map-lot ID'}
        </Link>
      </td>
      <td>
        <ApplicationStatusChip
          state={row.state as CoreState}
          substep={row.substep}
          substepLabel={row.substep === null ? null : (substepLabel ?? '')}
        />
      </td>
      <td className="whitespace-nowrap tabular-nums">
        {row.receivedDate === null ? (
          <span className="text-muted-foreground">Not received</span>
        ) : (
          formatCivilDateShort(row.receivedDate)
        )}
      </td>
    </tr>
  )
}

export default async function StaffApplicationsPage({ searchParams }: Props) {
  const { params, sort, filters } = readApplicationsView(await searchParams)
  const ctx = await requireStaffContext()
  if (!mayOpen(APPLICATIONS_PATH, await loadNavViewer(ctx.db, ctx.actor, ctx.signal))) {
    return <NoPermission title="Applications" action="see applications" />
  }
  const [page, facets] = await Promise.all([
    listStaffApplications(
      ctx.db,
      ctx.actor,
      { filters, sort, limit: PAGE_SIZE, offset: readOffset(params) },
      ctx.signal,
    ),
    staffApplicationFacets(ctx.db, ctx.actor, { filters }, ctx.signal),
  ])
  const display = await displayIdsFor(
    ctx.db,
    page.rows.map((r) => r.parcelId),
  )
  const substepLabels = await substepLabelsFor(
    ctx.db,
    page.rows.map((r) => r.id),
    ctx.signal,
  )
  const links = sortLinks(APPLICATIONS_PATH, params, APPLICATION_SORT, sort)
  const clear = clearHref(APPLICATIONS_PATH, params, APPLICATION_FILTER_PARAMS)
  const pageLink = (offset: number | null) =>
    offset === null ? null : pageHref(APPLICATIONS_PATH, params, String(offset))
  return (
    <main data-wide="">
      <h1>Applications</h1>
      <p className="mb-5">
        Every application, newest first until you sort by a column. To search by number, use the{' '}
        <Link href="/staff/queue" className="text-action underline">
          work queue
        </Link>
        .
      </p>
      <FilterTabs label="Status" tabs={applicationStatusTabs(params, facets)} />
      <div className="toolbar mb-5">
        <QuickFilters
          label="Quick filters"
          groups={applicationChipGroups(params, facets)}
          clearHref={clear}
        />
      </div>
      <p className="mb-3 font-semibold text-ink">{`${page.total} ${page.total === 1 ? 'application' : 'applications'}`}</p>
      <div className="table-panel">
        {page.rows.length === 0 ? (
          <p className="px-5 py-8">
            {clear === null ? 'No applications yet.' : 'No applications match these filters.'}
          </p>
        ) : (
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr>
                <SortHeader label="Number" link={links.number} />
                <SortHeader label="Project" link={links.project} />
                <SortHeader label="Parcel" link={links.parcel} />
                <SortHeader label="State" link={links.state} />
                <SortHeader label="Received" link={links.received} />
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  parcel={display.get(row.parcelId)}
                  substepLabel={substepLabels.get(row.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TablePager
        offset={page.offset}
        shown={page.rows.length}
        total={page.total}
        prevHref={pageLink(page.prevOffset)}
        nextHref={pageLink(page.nextOffset)}
      />
    </main>
  )
}
