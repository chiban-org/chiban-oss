import { ActionForm } from '@/components/ActionForm'
import { AreaField, TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { CHANNEL_LABELS } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { complaintPublicTextAction, publishCaseAction, unpublishCaseAction } from '../actions'
import type { Can } from './can'
import { Hidden, Section } from './Section'

export function ComplaintsSection({ detail, can }: { detail: CaseDetail; can: Can }) {
  const { complaints, row } = detail.staff
  return (
    <Section id="complaints" title="Complaints">
      {complaints.length === 0 ? <p>No complaint is linked to this case.</p> : null}
      {complaints.map((c) => (
        <article key={c.id} className="space-y-2 rounded-md border p-3">
          <p className="m-0 font-medium">{`${c.number}, ${CHANNEL_LABELS[c.channel]}, received ${formatCivilDate(c.receivedOn)}`}</p>
          {c.channel === 'anonymous_web' ? (
            <p className="m-0">Anonymous. The town does not know who sent this.</p>
          ) : (
            <p className="m-0">{`Complainant: ${c.complainantName ?? 'not given'}, ${c.complainantEmail ?? 'no email'}, ${c.complainantPhone ?? 'no phone'}. Seen only by town staff.`}</p>
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
          {can.manage ? (
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
          ) : null}
        </article>
      ))}
      {can.manage ? (
        row.isPublic ? (
          <div className="space-y-2">
            <p className="m-0">{`This case is public. Summary: ${row.publicSummary ?? ''}`}</p>
            <ActionForm action={unpublishCaseAction} submitLabel="Make case private">
              <Hidden name="caseId" value={row.id} />
            </ActionForm>
          </div>
        ) : (
          <ActionForm action={publishCaseAction} submitLabel="Make case public">
            <Hidden name="caseId" value={row.id} />
            <TextField label="Public summary" name="summary" required />
            <p className="m-0">
              The public sees the case number, status, dates, summary, public complaint text, the
              provisions cited, and issued order numbers. Photos stay private until you publish them
              one by one.
            </p>
          </ActionForm>
        )
      ) : null}
    </Section>
  )
}
