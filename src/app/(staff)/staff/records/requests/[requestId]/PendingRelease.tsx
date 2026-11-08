import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import { RTK_METHOD_LABELS } from '@/features/rtk/labels'
import type { RequestApproval } from '@/features/rtk/requestPage'
import { formatInstantDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { createReleaseAction } from '../actions'
import { versionLabel } from './versionLabels'

function releaseLabel(count: number): string {
  return count === 1 ? 'Release 1 record' : `Release ${count} records`
}

export function PendingRelease({
  requestId,
  pending,
  today,
  timeZone,
}: {
  requestId: string
  pending: readonly RequestApproval[]
  today: CivilDate
  timeZone: string
}) {
  if (pending.length === 0) return null
  return (
    <section aria-label="Approved, not yet released" data-slot="pending-release">
      <h3>Approved, not yet released</h3>
      <ul className="list-none p-0">
        {pending.map((a) => (
          <li key={a.approvalId} className="record-item">
            <p className="m-0 font-medium">{a.title}</p>
            <p className="m-0 text-sm text-ink-secondary">
              {`${versionLabel(a.role, a.versionCreatedAt, timeZone)}. Approved ${formatInstantDate(a.approvedAt, timeZone)}.`}
            </p>
          </li>
        ))}
      </ul>
      <ActionForm
        action={createReleaseAction}
        submitLabel={releaseLabel(pending.length)}
        variant="default"
        confirm={{
          title: 'Release these records?',
          body: 'The approved records are sent to the requester. Once released they cannot be called back.',
          confirmLabel: 'Release the records',
        }}
      >
        <input type="hidden" name="requestId" value={requestId} />
        {pending.map((a) => (
          <input
            key={a.approvalId}
            type="hidden"
            name="items"
            value={`${a.documentId}:${a.approvalId}`}
          />
        ))}
        <TextField
          label="Date released"
          name="releasedOn"
          type="date"
          defaultValue={today}
          required
        />
        <SelectField label="How" name="method" options={Object.entries(RTK_METHOD_LABELS)} />
        <TextField label="Email address, for a link" name="recipientEmail" type="email" />
      </ActionForm>
    </section>
  )
}
