import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import type { ApplicationSnapshotRow, LegalHoldRow } from '@/db/schema'
import { formatInstant } from '@/lib/formatDate'
import { placeHoldAction, recordBuildingRemovedAction } from '../../records/actions'

interface Props {
  applicationId: string
  projectId: string
  snapshots: Pick<ApplicationSnapshotRow, 'id' | 'sequence' | 'reason' | 'createdAt'>[]
  holds: LegalHoldRow[]
  canHold: boolean
  canManage: boolean
  zone: string
}

export function RecordsPanel(props: Props) {
  return (
    <section aria-label="Records">
      <h2>Records</h2>
      <h3>Snapshots</h3>
      {props.snapshots.length === 0 ? (
        <p>No snapshot yet. One is taken when the application is submitted.</p>
      ) : null}
      <ul className="space-y-1">
        {props.snapshots.map((s) => (
          <li key={s.id}>
            {`Snapshot ${s.sequence}, ${s.reason === 'submission' ? 'at submission' : 'after an amendment'}, ${formatInstant(s.createdAt, props.zone)}`}
          </li>
        ))}
      </ul>
      <h3>Legal holds</h3>
      {props.holds.length === 0 ? <p>No legal hold covers this application.</p> : null}
      <ul className="space-y-1">
        {props.holds.map((h) => (
          <li key={h.id}>{`${h.targetKind} hold: ${h.reason}`}</li>
        ))}
      </ul>
      {props.canHold ? (
        <ActionForm action={placeHoldAction} submitLabel="Place hold on this application">
          <input type="hidden" name="targetKind" value="application" />
          <input type="hidden" name="targetId" value={props.applicationId} />
          <TextField label="Reason (at least 10 characters)" name="reason" required />
        </ActionForm>
      ) : null}
      {props.canManage ? (
        <ActionForm action={recordBuildingRemovedAction} submitLabel="Record building removed">
          <input type="hidden" name="projectId" value={props.projectId} />
          <TextField label="Date the building was removed" name="occurredOn" type="date" required />
        </ActionForm>
      ) : null}
    </section>
  )
}
