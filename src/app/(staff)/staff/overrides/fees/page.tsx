import Link from 'next/link'
import { StatusChip } from '@/components/StatusChip'
import { OverridesTabs } from '@/components/staff/OverridesTabs'
import { listFeeOverrides } from '@/features/fees/feeOverrides'
import type { OverrideStatus } from '@/features/parcels/aliasOverrides'
import { formatCents } from '@/lib/money'
import { createContext } from '@/server/trpc/context'

const CHIP: Record<
  OverrideStatus,
  { chip: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string }
> = {
  applied: { chip: 'passed', label: 'Applied' },
  no_match: { chip: 'failed', label: 'No match: the fee schedule has no such fee' },
  superseded: { chip: 'neutral', label: 'Superseded' },
  expired: { chip: 'neutral', label: 'Expired: the application is closed' },
}

export default async function FeeOverridesPage() {
  const ctx = await createContext()
  const rows = await listFeeOverrides(ctx.db, ctx.signal)
  return (
    <main>
      <OverridesTabs current="/staff/overrides/fees" />
      <h1>Fee overrides</h1>
      <p className="text-muted-foreground">
        A waiver or a set amount replaces the computed fee at the next assessment. The computed
        amount stays on the fee table so the difference is visible.
      </p>
      {rows.length === 0 ? (
        <p className="my-4">No fee has been overridden.</p>
      ) : (
        <table className="my-4 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">Application</th>
              <th>Fee</th>
              <th>Override</th>
              <th>Reason</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">
                  <Link
                    href={`/staff/applications/${row.applicationId}`}
                    className="text-action underline"
                  >
                    {row.applicationNumber}
                  </Link>
                </td>
                <td>{row.feeCode}</td>
                <td>
                  {row.kind === 'waive' ? 'Waived' : `Set to ${formatCents(row.amountCents ?? 0)}`}
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
    </main>
  )
}
