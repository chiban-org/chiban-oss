import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { AreaField, SelectField, TextField } from '@/components/staff/fields'
import { PROVISION_KINDS } from '@/db/schema'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { mayRecordFinding } from '@/features/enforcement/caseTransitions'
import {
  FINDING_STATUS_LABELS,
  NOTICE_METHOD_LABELS,
  NOTICE_SENT_PHRASES,
  PROVISION_KIND_LABELS,
} from '@/features/enforcement/labels'
import { NO_HOSTED } from '@/features/enforcement/workPlanTypes'
import { formatCivilDate } from '@/lib/formatDate'
import {
  addNoteAction,
  recordFindingAction,
  recordNoticeReceiptAction,
  sendNoticeAction,
} from '../findingActions'
import type { Can } from './can'
import { FindingChoices } from './FindingChoices'
import { Hidden, Section } from './Section'

const METHODS = Object.entries(NOTICE_METHOD_LABELS) as [string, string][]
const KINDS = PROVISION_KINDS.map((k) => [k, PROVISION_KIND_LABELS[k]] as [string, string])

export function NotesSection({ detail, can }: { detail: CaseDetail; can: Can }) {
  return (
    <Section id="notes" title="Investigation notes">
      {detail.staff.notes.length === 0 ? <p>No notes yet.</p> : null}
      <ul className="m-0 list-none space-y-2 p-0">
        {detail.staff.notes.map((n) => (
          <li key={n.id} className="record-item">
            <p className="m-0 font-medium">{`${formatCivilDate(n.observedOn)}, ${detail.names[n.authorId] ?? 'Staff'}`}</p>
            <p className="m-0 whitespace-pre-wrap">{n.body}</p>
          </li>
        ))}
      </ul>
      {can.manage ? (
        <details>
          <summary>Add a note</summary>
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
        </details>
      ) : null}
    </Section>
  )
}

type Variant = 'default' | 'outline'

function openFindingChoices(detail: CaseDetail) {
  return detail.findings
    .filter((f) => f.status === 'open')
    .map((f) => ({
      id: f.id,
      label: `${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef}`,
    }))
}

export function RecordFindingForm({ detail, variant }: { detail: CaseDetail; variant: Variant }) {
  return (
    <ActionForm action={recordFindingAction} submitLabel="Record finding" variant={variant}>
      <Hidden name="caseId" value={detail.staff.row.id} />
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
  )
}

export function ReceiptForm({
  detail,
  noticeId,
  variant,
}: {
  detail: CaseDetail
  noticeId: string
  variant: Variant
}) {
  return (
    <ActionForm action={recordNoticeReceiptAction} submitLabel="Record receipt" variant={variant}>
      <Hidden name="noticeId" value={noticeId} />
      <TextField
        label="Date received"
        name="receivedOn"
        type="date"
        defaultValue={detail.today}
        required
      />
      <TextField label="How receipt is known" name="basis" required />
    </ActionForm>
  )
}

export function SendNoticeForm({ detail, variant }: { detail: CaseDetail; variant: Variant }) {
  return (
    <ActionForm action={sendNoticeAction} submitLabel="Send notice of violation" variant={variant}>
      <Hidden name="caseId" value={detail.staff.row.id} />
      <FindingChoices legend="Findings to include" choices={openFindingChoices(detail)} />
      <TextField label="Date sent" name="sentOn" type="date" defaultValue={detail.today} required />
      <SelectField label="How it was sent" name="method" options={METHODS} />
    </ActionForm>
  )
}

function NoticeItem({
  notice,
  detail,
  canReceive,
}: {
  notice: CaseDetail['notices'][number]
  detail: CaseDetail
  canReceive: boolean
}) {
  const n = notice
  return (
    <li className="record-item space-y-2">
      <p>
        {`${NOTICE_SENT_PHRASES[n.method]} on ${formatCivilDate(n.sentOn)}. `}
        {n.receivedOn === null
          ? 'Receipt not recorded.'
          : `Received ${formatCivilDate(n.receivedOn)}: ${n.receiptBasis ?? ''}.`}{' '}
        {n.documentId === null ? null : (
          <a {...NEW_TAB} href={`/api/documents/${n.documentId}`}>
            Open notice
          </a>
        )}
      </p>
      {canReceive && n.receivedOn === null ? (
        <details>
          <summary>Record receipt</summary>
          <ReceiptForm detail={detail} noticeId={n.id} variant="outline" />
        </details>
      ) : null}
    </li>
  )
}

export function FindingsSection({
  detail,
  can,
  hosted = NO_HOSTED,
}: {
  detail: CaseDetail
  can: Can
  hosted?: ReadonlySet<string>
}) {
  const open = detail.findings.filter((f) => f.status === 'open')
  const finding =
    can.manage && mayRecordFinding(detail.staff.row.status) && !hosted.has('record_finding')
  return (
    <Section id="findings" title="Findings and notices of violation">
      {detail.findings.length === 0 ? <p>No violation has been found yet.</p> : null}
      <ul className="m-0 list-none space-y-2 p-0">
        {detail.findings.map((f) => (
          <li key={f.id} className="record-item">
            <p className="m-0 font-medium">{`${PROVISION_KIND_LABELS[f.provisionKind]}: ${f.provisionRef} (${FINDING_STATUS_LABELS[f.status]})`}</p>
            <p className="m-0">{`${f.facts} Inspected ${formatCivilDate(f.inspectionDate)}, found by ${detail.names[f.foundBy] ?? 'staff'}.`}</p>
          </li>
        ))}
      </ul>
      {finding ? (
        <details>
          <summary>Record a finding</summary>
          <RecordFindingForm detail={detail} variant="outline" />
        </details>
      ) : null}
      <h3>Notices of violation</h3>
      {detail.notices.length === 0 ? <p>No notice has been sent.</p> : null}
      <ul className="list-none space-y-2 p-0">
        {detail.notices.map((n) => (
          <NoticeItem
            key={n.id}
            notice={n}
            detail={detail}
            canReceive={can.manage && !hosted.has(`record_notice_receipt:${n.id}`)}
          />
        ))}
      </ul>
      {can.manage && open.length > 0 && !hosted.has('send_notice') ? (
        <details>
          <summary>Send a notice of violation</summary>
          <SendNoticeForm detail={detail} variant="outline" />
        </details>
      ) : null}
    </Section>
  )
}
