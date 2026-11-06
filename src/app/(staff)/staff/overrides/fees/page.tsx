import type { Metadata } from 'next'
import Link from 'next/link'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { TablePager } from '@/components/dataTable/TablePager'
import { StatusChip } from '@/components/StatusChip'
import { NoPermission } from '@/components/staff/NoPermission'
import { OverridesTabs } from '@/components/staff/OverridesTabs'
import { pagerLinks, slicePage } from '@/features/dataTable/pageSlice'
import { clearHref, type RawSearchParams, readOffset } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import { listFeeOverrides } from '@/features/fees/feeOverrides'
import {
  arrangeFeeOverrides,
  FEE_FILTER_PARAMS,
  FEE_OVERRIDES_PATH,
  FEE_SORT,
  readFeeOverrideView,
} from '@/features/overrides/feeOverrideView'
import type { OverrideStatus } from '@/features/parcels/aliasOverrides'
import { formatCents } from '@/lib/money'
import { recordStaffContext } from '@/server/requireStaff'

export const metadata: Metadata = { title: 'Fee overrides' }

const CHIP: Record<
  OverrideStatus,
  { chip: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string }
> = {
  applied: { chip: 'passed', label: 'Applied' },
  no_match: { chip: 'failed', label: 'No match: the fee schedule has no such fee' },
  superseded: { chip: 'neutral', label: 'Superseded' },
  expired: { chip: 'neutral', label: 'Expired: the application is closed' },
}

const PAGE_SIZE = 25

export default async function FeeOverridesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const view = readFeeOverrideView(await searchParams)
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Fee overrides" action="see overrides" />
  const all = await listFeeOverrides(ctx.db, ctx.signal)
  const { rows: arranged, chips } = arrangeFeeOverrides(all, view)
  const page = slicePage(arranged, readOffset(view.params), PAGE_SIZE)
  const links = sortLinks(FEE_OVERRIDES_PATH, view.params, FEE_SORT, view.sort)
  const clear = clearHref(FEE_OVERRIDES_PATH, view.params, FEE_FILTER_PARAMS)
  return (
    <main data-wide="">
      <h1>Fee overrides</h1>
      <p>
        A waiver or a set amount replaces the computed fee at the next assessment. The computed
        amount stays on the fee table so the difference is visible. Newest first.
      </p>
      <OverridesTabs current="/staff/overrides/fees" />
      {all.length === 0 ? (
        <p>No fee has been overridden.</p>
      ) : (
        <>
          <div className="toolbar">
            <QuickFilters label="Quick filters" groups={chips} clearHref={clear} />
          </div>
          <div className="table-panel">
            {page.rows.length === 0 ? (
              <p className="px-5 py-8">No override matches these filters.</p>
            ) : (
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr>
                    <SortHeader label="Application" link={links.application} />
                    <SortHeader label="Fee" link={links.fee} />
                    <SortHeader label="Override" link={links.override} />
                    <SortHeader label="Reason" link={links.reason} />
                    <SortHeader label="Status" link={links.status} />
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/staff/applications/${row.applicationId}`}>
                          {row.applicationNumber}
                        </Link>
                      </td>
                      <td>{row.feeLabel}</td>
                      <td>
                        {row.kind === 'waive'
                          ? 'Waived'
                          : `Set to ${formatCents(row.amountCents ?? 0)}`}
                      </td>
                      <td>{row.reason}</td>
                      <td>
                        <StatusChip status={CHIP[row.status].chip} label={CHIP[row.status].label} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <TablePager {...pagerLinks(FEE_OVERRIDES_PATH, view.params, page)} />
        </>
      )}
    </main>
  )
}
