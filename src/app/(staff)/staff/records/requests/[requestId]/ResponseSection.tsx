import { ActionForm } from '@/components/ActionForm'
import { TextField } from '@/components/staff/fields'
import { costTotal, RTK_RESPONSE_LABELS } from '@/features/rtk/labels'
import type { RtkRequestView } from '@/features/rtk/requests'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { firstResponseAction } from '../actions'
import { ResponseKindFields } from './ResponseKindFields'

const FORM_RESPONSE_OPTIONS = Object.entries<string>(RTK_RESPONSE_LABELS).filter(
  ([kind]) => kind !== 'made_available',
)

function timelinessText(request: RtkRequestView): string | null {
  const t = request.timeliness
  if (t.kind === 'responded_late') {
    return `Answered late: due ${formatCivilDate(t.dueOn)}, answered ${formatCivilDate(t.respondedOn)}.`
  }
  return t.kind === 'responded_on_time' ? 'Answered on time.' : null
}

function ResponseForm({ requestId, today }: { requestId: string; today: CivilDate }) {
  return (
    <details>
      <summary>Record the first response</summary>
      <ActionForm action={firstResponseAction} submitLabel="Record response">
        <input type="hidden" name="requestId" value={requestId} />
        <p className="m-0">
          To make records available, approve and release them under Releases. The first release
          records the response.
        </p>
        <ResponseKindFields options={FORM_RESPONSE_OPTIONS} today={today} />
        <TextField label="Charge, if any (what it is for)" name="costLabel" />
        <TextField label="Charge in dollars" name="costDollars" type="number" min="0" step="0.01" />
      </ActionForm>
    </details>
  )
}

function recordedLine(request: RtkRequestView): string {
  const label = RTK_RESPONSE_LABELS[request.firstResponseKind as keyof typeof RTK_RESPONSE_LABELS]
  return request.firstResponseOn === null
    ? `${label}.`
    : `${label}, ${formatCivilDate(request.firstResponseOn)}.`
}

function RecordedResponse({ request }: { request: RtkRequestView }) {
  const late = timelinessText(request)
  return (
    <>
      <p className="m-0">{recordedLine(request)}</p>
      {late === null ? null : <p className="m-0">{late}</p>}
      {request.timeStatements.map((s) => (
        <p key={s.id} className="m-0">
          {`More time needed until ${formatCivilDate(s.statedDate)}: ${s.delayReason}${s.costEstimate.length > 0 ? ` Estimated charge ${costTotal(s.costEstimate)}.` : ''}`}
        </p>
      ))}
    </>
  )
}

export function ResponseSection({
  request,
  today,
  working,
}: {
  request: RtkRequestView
  today: CivilDate
  working: boolean
}) {
  const recorded = request.firstResponseKind !== null
  return (
    <section aria-labelledby="first-response">
      <h2 id="first-response">First response</h2>
      {recorded ? <RecordedResponse request={request} /> : <p>No response recorded yet.</p>}
      {working && !recorded ? <ResponseForm requestId={request.id} today={today} /> : null}
    </section>
  )
}
