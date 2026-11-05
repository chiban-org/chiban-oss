import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { aliasSourceText, retiredText } from '@/features/parcels/parcelText'
import type { StaffParcelView } from '@/features/parcels/staffParcelView'
import { createAliasOverrideAction } from './actions'

export function ParcelIds({
  aliases,
  displayId,
  canManage,
}: {
  aliases: StaffParcelView['aliases']
  displayId: string
  canManage: boolean
}) {
  return (
    <section aria-label="IDs">
      <h2>IDs</h2>
      <table className="text-sm">
        <thead>
          <tr>
            <th>Format</th>
            <th>Value</th>
            <th>Status</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {aliases.map((a) => (
            <tr key={`${a.format}:${a.value}:${a.status}`}>
              <td>{a.label}</td>
              <td>{a.value}</td>
              <td>{a.status === 'retired' ? retiredText(a.retiredOn) : 'Active'}</td>
              <td>{aliasSourceText(a.source)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canManage ? (
        <details>
          <summary>Override an ID</summary>
          <ActionForm action={createAliasOverrideAction} submitLabel="Save override">
            <input type="hidden" name="parcelRef" value={displayId} />
            <TextField
              label="Format key"
              name="format"
              required
              hint="For example cama15 or gis12."
            />
            <TextField label="ID value" name="value" required />
            <TextField label="Reason" name="reason" required />
            <TextField label="Expires on" name="expiresOn" type="date" />
          </ActionForm>
        </details>
      ) : null}
    </section>
  )
}
