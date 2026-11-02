import Link from 'next/link'
import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { TextField } from '@/components/staff/fields'
import { NoPermission } from '@/components/staff/NoPermission'
import { OverridesTabs } from '@/components/staff/OverridesTabs'
import { listAliasOverrides, type OverrideStatus } from '@/features/parcels/aliasOverrides'
import { formatCivilDate } from '@/lib/formatDate'
import { recordStaffContext } from '@/server/requireStaff'
import { createAliasOverrideAction } from '../../parcels/[parcelId]/actions'

const CHIP: Record<
  OverrideStatus,
  { chip: 'passed' | 'failed' | 'overdue' | 'neutral'; label: string }
> = {
  applied: { chip: 'passed', label: 'Applied' },
  no_match: { chip: 'overdue', label: 'No match: parcel retired' },
  superseded: { chip: 'neutral', label: 'Superseded' },
  expired: { chip: 'neutral', label: 'Expired' },
}

export default async function StaffAliasOverridesPage() {
  const ctx = await recordStaffContext()
  if (ctx === null) return <NoPermission title="Parcel ID overrides" action="see overrides" />
  const rows = await listAliasOverrides(ctx.db, new Date(), ctx.signal)
  return (
    <main>
      <OverridesTabs current="/staff/overrides/aliases" />
      <h1>Parcel ID overrides</h1>
      <p className="text-muted-foreground">
        An override points a town ID at a parcel. Imports never overwrite an override; they send the
        conflict to the exception queue.
      </p>
      {rows.length === 0 ? (
        <p className="my-4">No overrides are in force.</p>
      ) : (
        <table className="my-4 w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2">ID</th>
              <th>Points to</th>
              <th>Replaced</th>
              <th>Reason</th>
              <th>Expires</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b">
                <td className="py-2">{`${row.format}: ${row.value}`}</td>
                <td>
                  <Link href={`/staff/parcels/${row.parcelId}`} className="text-action underline">
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Add an override</h2>
      <ActionForm
        action={createAliasOverrideAction}
        submitLabel="Save override"
        className="max-w-md"
      >
        <TextField label="Format key" name="format" required hint="For example cama15 or gis12." />
        <TextField label="ID value" name="value" required />
        <TextField
          label="Points to parcel"
          name="parcelRef"
          required
          hint="Any current or retired parcel ID."
        />
        <TextField label="Reason" name="reason" required />
        <TextField label="Expires on" name="expiresOn" type="date" />
      </ActionForm>
    </main>
  )
}
