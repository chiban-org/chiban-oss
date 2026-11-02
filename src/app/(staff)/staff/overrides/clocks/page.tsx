import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { OverridesTabs } from '@/components/staff/OverridesTabs'
import { listClockAdjustments } from '@/features/clocks/clockOverrides'
import type { OverrideStatus } from '@/features/parcels/aliasOverrides'
import { requireStaffContext } from '@/server/requireStaff'

const CHIP: Record<
  OverrideStatus,
  { chip: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string }
> = {
  applied: { chip: 'passed', label: 'Applied' },
  no_match: { chip: 'failed', label: 'No match: the rule changed' },
  superseded: { chip: 'neutral', label: 'Superseded' },
  expired: { chip: 'neutral', label: 'Expired: the clock is no longer running' },
}

export default async function ClockOverridesPage() {
  const ctx = await requireStaffContext()
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
        <table className="my-4 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Application</th>
              <th>Rule</th>
              <th>Adjustment</th>
              <th>New due date</th>
              <th>Reason</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b align-top">
                <td className="py-2">
                  <Link
                    href={`/staff/applications/${row.applicationId}`}
                    className="text-action underline"
                  >
                    View application
                  </Link>
                </td>
                <td>{row.ruleKey}</td>
                <td>{`${row.kind.replaceAll('_', ' ')}${row.days === null ? '' : `, ${row.days} days`}`}</td>
                <td>{row.newDue ?? 'Unchanged'}</td>
                <td>
                  {row.reason}
                  {row.legalAuthority === null ? null : (
                    <span className="block text-muted-foreground">
                      {`Authority: ${(row.legalAuthority as { citation: string }).citation}`}
                    </span>
                  )}
                </td>
                <td>
                  <StatusChip status={CHIP[row.status].chip} label={CHIP[row.status].label} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
