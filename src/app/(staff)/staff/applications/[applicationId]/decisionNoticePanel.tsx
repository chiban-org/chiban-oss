import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { DecisionNoticeView } from '@/features/applications/decisionNoticeView'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { documentKind } from '@/features/templates/kinds/documentKinds'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { recordDecisionNoticeAction } from './decisionNoticeActions'

const LABEL = 'Written decision notice'
const OWED_STATES: readonly string[] = ['decided', 'issued']
const NOTICE_STATES: readonly string[] = ['decided', 'issued', 'denied']
const GENERATED_LETTER = documentKind('permit_decision_letter').title

export interface NoticeDocument {
  documentId: string
  title: string
  supersededBy: string | null
}

export function noticeChoices(documents: readonly NoticeDocument[]): NoticeDocument[] {
  const live = documents.filter((d) => d.supersededBy === null)
  const generated = live.filter((d) => d.title === GENERATED_LETTER).reverse()
  return [...generated, ...live.filter((d) => d.title !== GENERATED_LETTER)]
}

export function noticeStatusText(
  notice: DecisionNoticeView,
  state: string,
  today: CivilDate,
): string {
  const cited = notice.citation === null ? '' : ` (${notice.citation})`
  if (notice.refusedOn !== null) {
    const refusal = `Refused by operation of law on ${formatCivilDate(notice.refusedOn)}${cited}.`
    return notice.mailedOn === null
      ? refusal
      : `${refusal} Written decision notice mailed to the applicant on ${formatCivilDate(notice.mailedOn)}.`
  }
  if (notice.mailedOn !== null) return `${LABEL} mailed on ${formatCivilDate(notice.mailedOn)}.`
  if (notice.dueOn === null) return `${LABEL} required${cited}.`
  if (OWED_STATES.includes(state) && notice.dueOn < today) {
    return `${LABEL} was due ${formatCivilDate(notice.dueOn)} and is not recorded.`
  }
  return `${LABEL} due ${formatCivilDate(notice.dueOn)}${cited}.`
}

function RecordForm({
  applicationId,
  documents,
  today,
}: {
  applicationId: string
  documents: readonly NoticeDocument[]
  today: CivilDate
}) {
  const live = noticeChoices(documents)
  const preselected = live[0]?.title === GENERATED_LETTER ? live[0].documentId : ''
  if (live.length === 0) {
    return <p>File the notice among this application&apos;s documents, then record it here.</p>
  }
  return (
    <ActionForm
      action={recordDecisionNoticeAction}
      submitLabel="Record the written decision notice"
      variant="outline"
      className="max-w-md"
    >
      <input type="hidden" name="applicationId" value={applicationId} />
      <SelectField
        label="Notice document"
        name="documentId"
        required
        defaultValue={preselected}
        options={[
          ['', 'Choose the notice'],
          ...live.map((d): readonly [string, string] => [d.documentId, d.title]),
        ]}
      />
      <TextField
        label="Date mailed"
        name="mailedOn"
        type="date"
        defaultValue={today}
        max={today}
        required
      />
    </ActionForm>
  )
}

export function DecisionNoticePanel({
  view,
  documents,
}: {
  view: StaffApplicationView
  documents: readonly NoticeDocument[]
}) {
  const notice = view.decisionNotice
  if (notice == null) return null
  const open = notice.mailedOn === null && NOTICE_STATES.includes(view.state)
  return (
    <section aria-label={LABEL} id="decision-notice">
      <h2>{LABEL}</h2>
      <p>{noticeStatusText(notice, view.state, view.today)}</p>
      {open && view.permissions.canIssue ? (
        <RecordForm applicationId={view.id} documents={documents} today={view.today} />
      ) : null}
    </section>
  )
}
