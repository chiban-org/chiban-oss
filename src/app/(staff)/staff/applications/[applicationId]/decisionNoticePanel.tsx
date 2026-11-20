import { ActionForm } from '@/components/ActionForm'
import { SelectField, TextField } from '@/components/staff/fields'
import type { DecisionNoticeView } from '@/features/applications/decisionNoticeView'
import type { StaffApplicationView } from '@/features/applications/staffApplicationView'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { recordDecisionNoticeAction } from './decisionNoticeActions'

const LABEL = 'Written decision notice'
const OWED_STATES: readonly string[] = ['decided', 'issued']

export interface NoticeDocument {
  documentId: string
  title: string
  supersededBy: string | null
}

export function noticeStatusText(
  notice: DecisionNoticeView,
  state: string,
  today: CivilDate,
): string {
  const cited = notice.citation === null ? '' : ` (${notice.citation})`
  if (notice.refusedOn !== null) {
    return `Refused by operation of law on ${formatCivilDate(notice.refusedOn)}${cited}.`
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
  const live = documents.filter((d) => d.supersededBy === null)
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
  const open = notice.mailedOn === null && notice.refusedOn === null
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
