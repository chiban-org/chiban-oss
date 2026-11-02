import { ClockAdjustmentsTable } from '@/components/clocks/ClockAdjustmentsTable'
import { NoPermission } from '@/components/staff/NoPermission'
import { OverridesTabs } from '@/components/staff/OverridesTabs'
import { listClockAdjustments } from '@/features/clocks/clockOverrides'
import { recordStaffContext } from '@/server/requireStaff'

export default async function ClockOverridesPage() {
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Clock adjustments" action="see overrides" />
  const rows = await listClockAdjustments(ctx.db, ctx.signal)
  return (
    <main>
      <OverridesTabs current="/staff/overrides/clocks" />
      <h1>Clock adjustments</h1>
      <p className="text-muted-foreground">
        Every extension, waiver, statutory exception, tolling, and renewal that moved a due date. An
        adjustment whose clock was replaced by a rule change shows as no match and has a task to
        review it.
      </p>
      {rows.length === 0 ? (
        <p className="my-4">No clock has been adjusted.</p>
      ) : (
        <ClockAdjustmentsTable rows={rows} />
      )}
    </main>
  )
}
