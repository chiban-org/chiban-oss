import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { DateField, SelectField, TextField } from '@/components/staff/fields'
import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { cureMethodPhrase } from '@/features/enforcement/cureRules'
import { uncoveredOpenFindings } from '@/features/enforcement/cureStanding'
import { openFindingChoices } from '@/features/enforcement/findingChoices'
import { CURE_RECIPIENT_LABELS } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import {
  applyCureProcedureAction,
  recordCureReceiptAction,
  sendCureNoticeAction,
} from '../cureActions'
import type { Can } from './can'
import { FindingChoices } from './FindingChoices'
import { Hidden } from './Section'

type Variant = 'default' | 'outline'

export function ApplyCureForm({ detail }: { detail: CaseDetail }) {
  const options: [string, string][] = [
    ['', 'No cure procedure'],
    ...detail.cure.choices.map((c): [string, string] => [c.key, c.label]),
  ]
  return (
    <ActionForm action={applyCureProcedureAction} submitLabel="Save procedure" variant="outline">
      <Hidden name="caseId" value={detail.staff.row.id} />
      <SelectField
        label="Procedure"
        name="ruleKey"
        options={options}
        defaultValue={detail.cure.rule?.key ?? ''}
      />
    </ActionForm>
  )
}

export function SendCureNoticeForm({ detail, variant }: { detail: CaseDetail; variant: Variant }) {
  const covered = new Set(detail.cure.notices.flatMap((n) => n.findingIds))
  const choices = openFindingChoices(detail.findings, new Map()).filter((c) => !covered.has(c.id))
  return (
    <ActionForm action={sendCureNoticeAction} submitLabel="Record cure notice" variant={variant}>
      <Hidden name="caseId" value={detail.staff.row.id} />
      <FindingChoices legend="Findings the notice names" choices={choices} />
      <TextField
        label="Owner name"
        name="ownerName"
        defaultValue={detail.parcelOwner?.name ?? ''}
        required
      />
      <TextField
        label="Owner mailing address"
        name="ownerAddress"
        defaultValue={detail.parcelOwner?.mailingAddress ?? ''}
        required
      />
      <TextField label="Occupant name, if one applies" name="occupantName" />
      <TextField label="Occupant mailing address" name="occupantAddress" />
      <DateField label="Date mailed" name="sentOn" today={detail.today} />
    </ActionForm>
  )
}

function CureReceiptForm({ detail, noticeId }: { detail: CaseDetail; noticeId: string }) {
  return (
    <ActionForm
      action={recordCureReceiptAction}
      submitLabel="Record return receipt"
      variant="outline"
    >
      <Hidden name="cureNoticeId" value={noticeId} />
      <DateField label="Date on the return receipt" name="receivedOn" today={detail.today} />
    </ActionForm>
  )
}

function CureNoticeItem({
  notice,
  detail,
  canReceive,
}: {
  notice: CaseDetail['cure']['notices'][number]
  detail: CaseDetail
  canReceive: boolean
}) {
  return (
    <li className="record-item space-y-2">
      <p>
        {`${CURE_RECIPIENT_LABELS[notice.recipientRole]}: ${notice.recipientName}, ${notice.mailingAddress}. `}
        {`Mailed ${formatCivilDate(notice.sentOn)} ${cureMethodPhrase(detail.cure.rule)}. `}
        {`Cure period ends ${formatCivilDate(notice.due)}. `}
        {notice.returnReceiptOn === null
          ? 'Return receipt not recorded.'
          : `Return receipt dated ${formatCivilDate(notice.returnReceiptOn)}.`}{' '}
        {notice.documentId === null ? null : (
          <a {...NEW_TAB} href={`/api/documents/${notice.documentId}`}>
            Open notice
          </a>
        )}
      </p>
      {canReceive && notice.returnReceiptOn === null ? (
        <details>
          <summary>Record return receipt</summary>
          <CureReceiptForm detail={detail} noticeId={notice.id} />
        </details>
      ) : null}
    </li>
  )
}

export function CureSection({
  detail,
  can,
  hosted,
}: {
  detail: CaseDetail
  can: Can
  hosted: ReadonlySet<string>
}) {
  const { cure } = detail
  if (cure.choices.length === 0 && cure.rule === null) return null
  const uncovered = uncoveredOpenFindings(detail.findings, cure.notices).length > 0
  const manage = can.manage && detail.staff.row.status !== 'closed'
  return (
    <>
      <h3>Cure notice</h3>
      <p>{cure.rule === null ? 'No cure procedure is chosen for this case.' : cure.rule.label}</p>
      {manage && cure.notices.length === 0 ? (
        <details>
          <summary>Choose the procedure</summary>
          <ApplyCureForm detail={detail} />
        </details>
      ) : null}
      {cure.notices.length === 0 ? null : (
        <ul className="list-none space-y-2 p-0">
          {cure.notices.map((n) => (
            <CureNoticeItem key={n.id} notice={n} detail={detail} canReceive={manage} />
          ))}
        </ul>
      )}
      {manage && cure.rule !== null && uncovered && !hosted.has('send_cure_notice') ? (
        <details>
          <summary>Send a cure notice</summary>
          <SendCureNoticeForm detail={detail} variant="outline" />
        </details>
      ) : null}
    </>
  )
}
