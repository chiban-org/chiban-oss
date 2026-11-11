import { ActionForm } from '@/components/ActionForm'
import { SelectField } from '@/components/staff/fields'
import type { AttachableComplaint } from '@/features/enforcement/complaintCandidates'
import { formatCivilDate } from '@/lib/formatDate'
import { attachComplaintAction } from '../publishActions'
import { Hidden } from './Section'

function optionText(c: AttachableComplaint): string {
  const place = c.sameParcel ? `${c.locationText} (same parcel)` : c.locationText
  return `${c.number}, received ${formatCivilDate(c.receivedOn)}, ${place}`
}

export function AttachComplaint({
  caseId,
  attachable,
}: {
  caseId: string
  attachable: readonly AttachableComplaint[]
}) {
  return (
    <details>
      <summary>Attach another complaint</summary>
      {attachable.length === 0 ? (
        <p>
          No other complaint can be attached right now. Only a complaint whose own case has no work
          recorded yet can be moved here.
        </p>
      ) : (
        <ActionForm action={attachComplaintAction} submitLabel="Attach complaint">
          <Hidden name="caseId" value={caseId} />
          <SelectField
            label="Complaint to attach"
            name="complaintId"
            hint="The complaint moves to this case with its photos. The case it came in on is closed."
            options={attachable.map((c) => [c.id, optionText(c)] as const)}
            required
          />
        </ActionForm>
      )}
    </details>
  )
}
