import { ActionForm } from '@/components/ActionForm'
import { AreaField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { ENDED_CASE_STATUSES } from '@/features/enforcement/complaintAttach'
import { CHANNEL_LABELS } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { complaintPublicTextAction } from '../publishActions'
import { AttachComplaint } from './AttachComplaint'
import type { Can } from './can'
import { Hidden, Section } from './Section'

type Complaint = CaseDetail['staff']['complaints'][number]

function ComplaintLine({ complaint }: { complaint: Complaint }) {
  return (
    <p className="font-medium">{`${complaint.number}, ${CHANNEL_LABELS[complaint.channel]}, received ${formatCivilDate(complaint.receivedOn)}`}</p>
  )
}

function ComplaintSummary({ complaint }: { complaint: Complaint }) {
  return (
    <article className="record-item space-y-2">
      <ComplaintLine complaint={complaint} />
      <p>Who sent it and what they reported are seen only by enforcement staff.</p>
    </article>
  )
}

function ManagedComplaint({ complaint: c, readOnly }: { complaint: Complaint; readOnly: boolean }) {
  return (
    <article className="record-item space-y-2">
      <ComplaintLine complaint={c} />
      {c.channel === 'anonymous_web' ? (
        <p>Anonymous. The town does not know who sent this.</p>
      ) : (
        <p>{`Complainant: ${c.complainantName ?? 'not given'}, ${c.complainantEmail ?? 'no email'}, ${c.complainantPhone ?? 'no phone'}. Seen only by town staff.`}</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="m-0 font-medium">What was reported</p>
          <p className="m-0 whitespace-pre-wrap">{c.descriptionOriginal}</p>
        </div>
        <div>
          <p className="m-0 font-medium">Public text</p>
          <p className="m-0 whitespace-pre-wrap">{c.descriptionPublic ?? 'Not written yet.'}</p>
        </div>
      </div>
      {readOnly ? null : (
        <details>
          <summary>Write the public text</summary>
          <ActionForm action={complaintPublicTextAction} submitLabel="Save public text">
            <Hidden name="complaintId" value={c.id} />
            <AreaField
              label="Public text. Remove anything that could identify the complainant."
              name="text"
              rows={3}
              defaultValue={c.descriptionPublic ?? ''}
              required
            />
          </ActionForm>
        </details>
      )}
    </article>
  )
}

export function ComplaintsSection({
  detail,
  can,
  readOnly = false,
}: {
  detail: CaseDetail
  can: Can
  readOnly?: boolean
}) {
  const { complaints } = detail.staff
  return (
    <Section id="complaints" title="Complaints">
      {complaints.length === 0 ? <p>No complaint is linked to this case.</p> : null}
      {complaints.map((c) =>
        can.manage ? (
          <ManagedComplaint key={c.id} complaint={c} readOnly={readOnly} />
        ) : (
          <ComplaintSummary key={c.id} complaint={c} />
        ),
      )}
      {can.manage && !readOnly && !ENDED_CASE_STATUSES.includes(detail.staff.row.status) ? (
        <AttachComplaint caseId={detail.staff.row.id} attachable={detail.attachable ?? []} />
      ) : null}
    </Section>
  )
}
