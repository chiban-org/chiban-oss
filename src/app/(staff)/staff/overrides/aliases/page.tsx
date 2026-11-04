import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'
import { ListHeader } from '@/components/layout/ListHeader'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { OverridesTabs } from '@/components/staff/OverridesTabs'
import { hasCapability } from '@/features/authz/capabilities'
import { pagerLinks, slicePage } from '@/features/dataTable/pageSlice'
import { clearHref, type RawSearchParams, readOffset } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import {
  ALIAS_FILTER_PARAMS,
  ALIAS_OVERRIDES_PATH,
  ALIAS_SORT,
  arrangeAliasOverrides,
  readAliasOverrideView,
} from '@/features/overrides/aliasOverrideView'
import { listAliasOverrides, type OverrideStatus } from '@/features/parcels/aliasOverrides'
import { formatCivilDate } from '@/lib/formatDate'
import { recordStaffContext } from '@/server/requireStaff'
import { AddAliasOverride, EditAliasOverride } from './AliasOverrideForms'

const PAGE_SIZE = 25

const CHIP: Record<
  OverrideStatus,
  { chip: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string }
> = {
  applied: { chip: 'passed', label: 'Applied' },
  no_match: { chip: 'overdue', label: 'No match: parcel retired' },
  superseded: { chip: 'neutral', label: 'Superseded' },
  expired: { chip: 'neutral', label: 'Expired' },
}

export default async function StaffAliasOverridesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const view = readAliasOverrideView(await searchParams)
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Parcel ID overrides" action="see overrides" />
  const [all, mayManage] = await Promise.all([
    listAliasOverrides(ctx.db, new Date(), ctx.signal),
    hasCapability(ctx.db, ctx.actor.userId, 'parcel.manage', ctx.signal),
  ])
  const { rows: arranged, chips } = arrangeAliasOverrides(all, view)
  const page = slicePage(arranged, readOffset(view.params), PAGE_SIZE)
  const links = sortLinks(ALIAS_OVERRIDES_PATH, view.params, ALIAS_SORT, view.sort)
  const clear = clearHref(ALIAS_OVERRIDES_PATH, view.params, ALIAS_FILTER_PARAMS)
  return (
    <main data-wide="">
      <ListHeader
        title="Parcel ID overrides"
        lead="An override points a town ID at a parcel. Imports never overwrite an override; they send the conflict to the exception queue. Newest first."
        actions={mayManage ? <AddAliasOverride /> : null}
      />
      <OverridesTabs current="/staff/overrides/aliases" />
      {all.length === 0 ? (
        <p>No overrides are in force.</p>
      ) : (
        <>
          <div className="toolbar">
            <QuickFilters label="Quick filters" groups={chips} clearHref={clear} />
          </div>
          <div className="table-panel">
            {page.rows.length === 0 ? (
              <p className="px-5 py-8">No override matches these filters.</p>
            ) : (
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr>
                    <SortHeader label="ID" link={links.id} />
                    <SortHeader label="Points to" link={links.parcel} />
                    <SortHeader label="Replaced" link={links.replaced} />
                    <SortHeader label="Reason" link={links.reason} />
                    <SortHeader label="Expires" link={links.expires} />
                    <SortHeader label="Status" link={links.status} />
                    {mayManage ? (
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{`${row.format}: ${row.value}`}</td>
                      <td>
                        <Link href={`/staff/parcels/${row.parcelId}`}>
                          {row.parcelDisplayId ?? 'No map-lot ID'}
                        </Link>
                      </td>
                      <td>
                        {row.replaced === null
                          ? 'Nothing'
                          : row.replaced.displayId || row.replaced.parcelId}
                      </td>
                      <td>{row.reason}</td>
                      <td>{row.expiresOn === null ? 'Never' : formatCivilDate(row.expiresOn)}</td>
                      <td>
                        <StatusChip status={CHIP[row.status].chip} label={CHIP[row.status].label} />
                      </td>
                      {mayManage ? (
                        <td>
                          {row.status === 'superseded' ? null : <EditAliasOverride row={row} />}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <TablePager {...pagerLinks(ALIAS_OVERRIDES_PATH, view.params, page)} />
        </>
      )}
    </main>
  )
}
