import type { Metadata } from 'next'
import Link from 'next/link'
import { FilterTabs } from '@/components/dataTable/FilterTabs'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'
import { ListHeader } from '@/components/layout/ListHeader'
import { NoPermission } from '@/components/staff/NoPermission'
import { pagerLinks } from '@/features/dataTable/pageSlice'
import { type RawSearchParams, readOffset } from '@/features/dataTable/params'
import { filterTabs } from '@/features/dataTable/quickFilters'
import { sortLinks } from '@/features/dataTable/sort'
import {
  HOLD_SORT,
  HOLDS_PATH,
  type HoldListRow,
  type HoldState,
  listHoldTable,
  readHoldView,
} from '@/features/records/holdList'
import { getTownSettings } from '@/features/town/settings'
import { formatInstant } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { PlaceHold, ReleaseHold } from './HoldForms'

export const metadata: Metadata = { title: 'Legal holds' }

export const dynamic = 'force-dynamic'

const KIND_LABELS: Record<HoldListRow['targetKind'], string> = {
  project: 'Project',
  application: 'Application',
  document: 'Document',
  enforcement_case: 'Case',
  rtk_request: 'Right-to-Know request',
}
const DEFAULT_ZONE = 'America/New_York'
const PAGE_SIZE = 25

function Subject({ row }: { row: HoldListRow }) {
  const label = row.subject === '' ? 'Record no longer found' : row.subject
  return row.href === null ? label : <Link href={row.href}>{label}</Link>
}

function emptyText(state: HoldState): string {
  return state === 'active'
    ? 'No record is on hold. Use Place a hold when litigation or a records request needs one.'
    : 'No hold has been released yet.'
}

export default async function HoldsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const { params, state, sort } = readHoldView(await searchParams)
  const ctx = await requireStaffContext()
  const list = await listHoldTable(
    ctx.db,
    ctx.actor,
    { state, sort, limit: PAGE_SIZE, offset: readOffset(params) },
    ctx.signal,
  )
  if (!list.ok) return <NoPermission title="Legal holds" action="manage legal holds" />
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  const links = sortLinks(HOLDS_PATH, params, HOLD_SORT, sort)
  const tabs = filterTabs(HOLDS_PATH, params, {
    param: 'state',
    label: 'Holds',
    defaultTab: 'active',
    options: [
      { value: 'active', label: 'Active', count: list.value.counts.get('active') ?? 0 },
      { value: 'released', label: 'Released', count: list.value.counts.get('released') ?? 0 },
    ],
  })
  const { rows } = list.value
  return (
    <main data-wide="">
      <ListHeader
        title="Legal holds"
        lead="A hold on a project, application, or document blocks disposition of everything under it. Newest hold first."
        actions={<PlaceHold />}
      />
      <FilterTabs label="Holds" tabs={tabs} />
      <div className="table-panel">
        {rows.length === 0 ? (
          <p className="px-5 py-8">{emptyText(state)}</p>
        ) : (
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr>
                <SortHeader label="Subject" link={links.subject} />
                <SortHeader label="Kind" link={links.kind} />
                <SortHeader label="Reason" link={links.reason} />
                <SortHeader label="Placed" link={links.placed} />
                <th scope="col">
                  {state === 'active' ? <span className="sr-only">Release</span> : 'Released'}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Subject row={row} />
                  </td>
                  <td className="whitespace-nowrap">{KIND_LABELS[row.targetKind]}</td>
                  <td>{row.reason}</td>
                  <td className="whitespace-nowrap">{formatInstant(row.placedAt, zone)}</td>
                  <td>
                    {row.releasedAt === null ? (
                      <ReleaseHold holdId={row.id} />
                    ) : (
                      `${formatInstant(row.releasedAt, zone)}: ${row.releaseReason ?? ''}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TablePager {...pagerLinks(HOLDS_PATH, params, list.value)} />
    </main>
  )
}
