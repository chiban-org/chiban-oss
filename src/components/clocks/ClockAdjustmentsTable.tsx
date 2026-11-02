import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { ruleLabel } from '@/features/packs/ruleLabel'
import type { OverrideStatus } from '@/features/parcels/aliasOverrides'
import { formatCivilDate } from '@/lib/formatDate'

const CHIP: Record<
  OverrideStatus,
  { chip: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string }
> = {
  applied: { chip: 'passed', label: 'Applied' },
  no_match: { chip: 'failed', label: 'No match: the rule changed' },
  superseded: { chip: 'neutral', label: 'Superseded' },
  expired: { chip: 'neutral', label: 'Expired: the clock is no longer running' },
}

export interface ClockAdjustmentView {
  id: string
  applicationId: string
  ruleKey: string
  kind: string
  days: number | null
  newDue: string | null
  reason: string
  legalAuthority: unknown
  status: OverrideStatus
}

export function ClockAdjustmentsTable({ rows }: { rows: ClockAdjustmentView[] }) {
  return (
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
            <td>{ruleLabel(row.ruleKey)}</td>
            <td>{`${row.kind.replaceAll('_', ' ')}${row.days === null ? '' : `, ${row.days} days`}`}</td>
            <td>{row.newDue === null ? 'Unchanged' : formatCivilDate(row.newDue)}</td>
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
  )
}
