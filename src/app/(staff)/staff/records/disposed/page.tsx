import { inArray } from 'drizzle-orm'
import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'
import { NoPermission } from '@/components/staff/NoPermission'
import { users } from '@/db/schema'
import { clearHref, pageHref, type RawSearchParams, readOffset } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { tombstoneChipGroups } from '@/features/disposition/tombstoneChips'
import {
  readTombstoneView,
  TOMBSTONE_FILTER_PARAMS,
  TOMBSTONE_SORT,
  TOMBSTONES_PATH,
} from '@/features/disposition/tombstoneParams'
import {
  listTombstones,
  type TombstoneRow,
  tombstoneFacets,
} from '@/features/disposition/tombstones'
import { getTownSettings } from '@/features/town/settings'
import { formatInstantDate } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50
const KIND = { document: 'Document', application_snapshot: 'Application snapshot' } as const

function Citation({ citation }: { citation: TombstoneRow['citation'] }) {
  return citation.url === null ? (
    citation.label
  ) : (
    <a href={citation.url} className="text-action underline">
      {citation.label}
    </a>
  )
}

export default async function DisposedRecordsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, sort, filters } = readTombstoneView(await searchParams)
  const ctx = await requireStaffContext()
  const list = await listTombstones(
    ctx.db,
    ctx.actor,
    { limit: PAGE_SIZE, offset: readOffset(params), sort, filters },
    ctx.signal,
  )
  if (!list.ok) return <NoPermission title="Disposed records" action="see disposed records" />
  const facets = await tombstoneFacets(ctx.db, { filters }, ctx.signal)
  const links = sortLinks(TOMBSTONES_PATH, params, TOMBSTONE_SORT, sort)
  const clear = clearHref(TOMBSTONES_PATH, params, TOMBSTONE_FILTER_PARAMS)
  const pageLink = (offset: number | null) =>
    offset === null ? null : pageHref(TOMBSTONES_PATH, params, String(offset))
  const ids = [...new Set(list.value.rows.flatMap((r) => [r.proposedBy, r.approvedBy]))]
  const people =
    ids.length === 0
      ? []
      : await ctx.db
          .select({ id: users.id, name: users.displayName })
          .from(users)
          .where(inArray(users.id, ids))
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Staff'
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : 'America/New_York'
  return (
    <main className="space-y-6">
      <h1>Disposed records</h1>
      <p className="m-0">
        Each record disposed of under its retention schedule leaves a tombstone: what it was, the
        series that allowed it, and who proposed and approved it. The record itself is gone, so this
        list is read-only.
      </p>
      <div className="toolbar mt-4">
        <QuickFilters
          label="Quick filters"
          groups={tombstoneChipGroups(params, facets)}
          clearHref={clear}
        />
      </div>
      <div className="table-panel">
        {list.value.rows.length === 0 ? (
          <p className="px-5 py-8">
            {clear === null
              ? 'No record has been disposed of.'
              : 'No disposed record matches these filters.'}
          </p>
        ) : (
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr>
                <SortHeader label="Record" link={links.record} />
                <SortHeader label="Kind" link={links.kind} />
                <SortHeader label="Retention series" link={links.series} />
                <SortHeader label="Disposed of" link={links.disposed} />
                <SortHeader label="Proposed and approved by" />
              </tr>
            </thead>
            <tbody>
              {list.value.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td>{KIND[r.recordKind]}</td>
                  <td>
                    {`${r.seriesLabel} `}
                    <Citation citation={r.citation} />
                  </td>
                  <td>
                    <Link
                      href={`/staff/records/disposition/${r.batchId}`}
                      className="text-action underline"
                    >
                      {formatInstantDate(r.executedAt, zone)}
                    </Link>
                  </td>
                  <td>{`${nameOf(r.proposedBy)}, ${nameOf(r.approvedBy)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TablePager
        offset={list.value.offset}
        shown={list.value.rows.length}
        total={list.value.total}
        prevHref={pageLink(list.value.prevOffset)}
        nextHref={pageLink(list.value.nextOffset)}
      />
    </main>
  )
}
