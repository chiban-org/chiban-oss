import Link from 'next/link'
import { SortHeader } from '@/components/dataTable/SortHeader'
import { StatusChip } from '@/components/StatusChip'
import { adjustmentKindLabel } from '@/features/clocks/adjustmentKinds'
import type { SortLink } from '@/features/dataTable/sort'
import type { ClockSortKey } from '@/features/overrides/clockOverrideView'
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
  applicationNumber: string
  ruleKey: string
  kind: string
  days: number | null
  newDue: string | null
  reason: string
  legalAuthority: unknown
  status: OverrideStatus
}

function adjustmentText(row: ClockAdjustmentView): string {
  return `${adjustmentKindLabel(row.kind)}${row.days === null ? '' : `, ${row.days} days`}`
}

export function ClockAdjustmentsTable({
  rows,
  links = {},
}: {
  rows: ClockAdjustmentView[]
  links?: Partial<Record<ClockSortKey, SortLink>>
}) {
  return (
    <div className="table-panel">
      <table className="w-full min-w-[48rem] text-sm">
        <thead>
          <tr>
            <SortHeader label="Application" link={links.application} />
            <SortHeader label="Rule" link={links.rule} />
            <SortHeader label="Adjustment" link={links.adjustment} />
            <SortHeader label="New due date" link={links.due} />
            <SortHeader label="Reason" link={links.reason} />
            <SortHeader label="Status" link={links.status} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap">
                <Link href={`/staff/applications/${row.applicationId}`}>
                  {row.applicationNumber}
                </Link>
              </td>
              <td>{ruleLabel(row.ruleKey)}</td>
              <td>{adjustmentText(row)}</td>
              <td className="whitespace-nowrap">
                {row.newDue === null ? 'Unchanged' : formatCivilDate(row.newDue)}
              </td>
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
    </div>
  )
}
