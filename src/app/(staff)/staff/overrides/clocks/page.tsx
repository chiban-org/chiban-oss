import { ClockAdjustmentsTable } from '@/components/clocks/ClockAdjustmentsTable'
import { QuickFilters } from '@/components/dataTable/QuickFilters'
import { NoPermission } from '@/components/staff/NoPermission'
import { OverridesTabs } from '@/components/staff/OverridesTabs'
import { listClockAdjustments } from '@/features/clocks/clockOverrides'
import { clearHref, type RawSearchParams } from '@/features/dataTable/params'
import { sortLinks } from '@/features/dataTable/sort'
import {
  arrangeClockAdjustments,
  CLOCK_FILTER_PARAMS,
  CLOCK_OVERRIDES_PATH,
  CLOCK_SORT,
  readClockAdjustmentView,
} from '@/features/overrides/clockOverrideView'
import { recordStaffContext } from '@/server/requireStaff'

export default async function ClockOverridesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const view = readClockAdjustmentView(await searchParams)
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Clock adjustments" action="see overrides" />
  const all = await listClockAdjustments(ctx.db, ctx.signal)
  const { rows, chips } = arrangeClockAdjustments(all, view)
  const links = sortLinks(CLOCK_OVERRIDES_PATH, view.params, CLOCK_SORT, view.sort)
  const clear = clearHref(CLOCK_OVERRIDES_PATH, view.params, CLOCK_FILTER_PARAMS)
  return (
    <main data-wide="">
      <h1>Clock adjustments</h1>
      <p>
        Every extension, waiver, statutory exception, tolling, and renewal that moved a due date. An
        adjustment whose clock was replaced by a rule change shows as no match and has a task to
        review it. Newest first.
      </p>
      <OverridesTabs current="/staff/overrides/clocks" />
      {all.length === 0 ? (
        <p>No clock has been adjusted.</p>
      ) : (
        <>
          <div className="toolbar">
            <QuickFilters label="Quick filters" groups={chips} clearHref={clear} />
          </div>
          {rows.length === 0 ? (
            <div className="table-panel">
              <p className="px-5 py-8">No adjustment matches these filters.</p>
            </div>
          ) : (
            <ClockAdjustmentsTable rows={rows} links={links} />
          )}
        </>
      )}
    </main>
  )
}
