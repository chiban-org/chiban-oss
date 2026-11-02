import { ActionForm } from '@/components/ActionForm'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { PROVISION_KINDS } from '@/db/schema'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import {
  FINDING_STATUS_LABELS,
  NOTICE_METHOD_LABELS,
  PROVISION_KIND_LABELS,
} from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import {
  addNoteAction,
  recordFindingAction,
  recordNoticeReceiptAction,
  sendNoticeAction,
} from '../actions'
import type { Can } from './can'
import { Hidden, Section } from './Section'

const METHODS = Object.entries(NOTICE_METHOD_LABELS) as [string, string][]
const KINDS = PROVISION_KINDS.map((k) => [k, PROVISION_KIND_LABELS[k]] as [string, string])

export function NotesSection({ detail, can }: { detail: CaseDetail; can: Can }) {
  return (
    <Section id="notes" title="Investigation notes">
      {detail.staff.notes.length === 0 ? <p>No notes yet.</p> : null}
      <ul className="m-0 list-none space-y-2 p-0">
        {detail.staff.notes.map((n) => (
          <li key={n.id} className="rounded-md border p-3">
            <p className="m-0 font-medium">{`${formatCivilDate(n.observedOn)}, ${detail.names[n.authorId] ?? 'Staff'}`}</p>
            <p className="m-0 whitespace-pre-wrap">{n.body}</p>
          </li>
        ))}
      </ul>
      {can.manage ? (
        <ActionForm action={addNoteAction} submitLabel="Add note">
          <Hidden name="caseId" value={detail.staff.row.id} />
          <TextField
            label="Date observed"
            name="observedOn"
            type="date"
            defaultValue={detail.today}
            required
          />
          <AreaField label="Note" name="body" rows={3} required />
        </ActionForm>
      ) : null}
    </Section>
  )
}

export function FindingsSection({ detail, can }: { detail: CaseDetail; can: Can }) {
  const open = detail.findings.filter((f) => f.status === 'open')
  const caseId = detail.staff.row.id
  return (
    <Section id="findings" title="Findings and notices of violation">
      {detail.findings.length === 0 ? <p>No violation has been found yet.</p> : null}
      <ul className="m-0 list-none space-y-2 p-0">
        {detail.findings.map((f) => (
          <li key={f.id} className="rounded-md border p-3">
            <p className="m-0 font-medium">{`${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef} (${FINDING_STATUS_LABELS[f.status]})`}</p>
            <p className="m-0">{`${f.facts} Inspected ${formatCivilDate(f.inspectionDate)}, found by ${detail.names[f.foundBy] ?? 'staff'}.`}</p>
          </li>
        ))}
      </ul>
      {can.manage ? (
        <ActionForm action={recordFindingAction} submitLabel="Record finding">
          <Hidden name="caseId" value={caseId} />
          <SelectField label="What was violated" name="provisionKind" options={KINDS} />
          <TextField label="Section or condition" name="provisionRef" required />
          <AreaField label="Facts" name="facts" rows={3} required />
          <TextField
            label="Inspection date"
            name="inspectionDate"
            type="date"
            defaultValue={detail.today}
            required
          />
        </ActionForm>
      ) : null}
      <h3>Notices of violation</h3>
      {detail.notices.length === 0 ? <p>No notice has been sent.</p> : null}
      <ul className="m-0 list-none space-y-2 p-0">
        {detail.notices.map((n) => (
          <li key={n.id} className="space-y-2 rounded-md border p-3">
            <p className="m-0">
              {`Sent ${formatCivilDate(n.sentOn)} by ${NOTICE_METHOD_LABELS[n.method].toLowerCase()}. `}
              {n.receivedOn === null
                ? 'Receipt not recorded.'
                : `Received ${formatCivilDate(n.receivedOn)}: ${n.receiptBasis ?? ''}.`}{' '}
              {n.documentId === null ? null : (
                <a href={`/api/documents/${n.documentId}`} className="text-action underline">
                  Open notice
                </a>
              )}
            </p>
            {can.manage ? (
              <ActionForm action={recordNoticeReceiptAction} submitLabel="Record receipt">
                <Hidden name="noticeId" value={n.id} />
                <TextField
                  label="Date received"
                  name="receivedOn"
                  type="date"
                  defaultValue={detail.today}
                  required
                />
                <TextField label="How receipt is known" name="basis" required />
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
      {can.manage && open.length > 0 ? (
        <ActionForm action={sendNoticeAction} submitLabel="Send notice of violation">
          <Hidden name="caseId" value={caseId} />
          <fieldset className="space-y-1">
            <legend className="font-medium">Findings to include</legend>
            {open.map((f) => (
              <label key={f.id} className="flex items-center gap-2">
                <input type="checkbox" name="findingIds" value={f.id} />
                {`${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`}
              </label>
            ))}
          </fieldset>
          <TextField
            label="Date sent"
            name="sentOn"
            type="date"
            defaultValue={detail.today}
            required
          />
          <SelectField label="How it was sent" name="method" options={METHODS} />
        </ActionForm>
      ) : null}
    </Section>
  )
}
