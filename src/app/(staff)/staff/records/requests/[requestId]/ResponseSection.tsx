import { NEW_TAB } from '@/components/newTab'
import type { RtkLetterOutcome } from '@/db/schema'
import { costTotal, responseLabel } from '@/features/rtk/labels'
import type { RtkRequestView } from '@/features/rtk/requests'
import { formatCivilDate, formatInstantDate } from '@/lib/formatDate'

function timelinessText(request: RtkRequestView): string | null {
  const t = request.timeliness
  if (t.kind === 'responded_late') {
    return `Answered late: due ${formatCivilDate(t.dueOn)}, answered ${formatCivilDate(t.respondedOn)}.`
  }
  return t.kind === 'responded_on_time' ? 'Answered on time.' : null
}

function recordedLine(request: RtkRequestView): string {
  const label = responseLabel(request.firstResponseKind) ?? 'Response recorded'
  return request.firstResponseOn === null
    ? `${label}.`
    : `${label}, ${formatCivilDate(request.firstResponseOn)}.`
}

function statementLine(statement: RtkRequestView['timeStatements'][number]): string {
  const charge =
    statement.costEstimate.length > 0
      ? ` Estimated charge ${costTotal(statement.costEstimate)}.`
      : ''
  return `More time needed until ${formatCivilDate(statement.statedDate)}: ${statement.delayReason}${charge}`
}

export function ResponseSection({ request }: { request: RtkRequestView }) {
  if (request.firstResponseKind === null) return null
  const late = timelinessText(request)
  return (
    <section aria-labelledby="first-response">
      <h2 id="first-response">First response</h2>
      <p>{recordedLine(request)}</p>
      {late === null ? null : <p>{late}</p>}
      {request.timeStatements.map((s) => (
        <p key={s.id}>{statementLine(s)}</p>
      ))}
      {request.deniedOn === null ? null : (
        <p>{`Denied after the time statement, ${formatCivilDate(request.deniedOn)}.`}</p>
      )}
    </section>
  )
}

export interface LetterDeliveryLine {
  documentId: string
  outcome: RtkLetterOutcome
  sentTo: string | null
  at: Date
}

function deliveryText(d: LetterDeliveryLine, timeZone: string): string {
  if (d.outcome === 'emailed')
    return `Emailed to ${d.sentTo ?? ''} on ${formatInstantDate(d.at, timeZone)}.`
  if (d.outcome === 'email_failed')
    return `The email to ${d.sentTo ?? ''} could not be sent. Print this letter and send it.`
  return 'No email address. Print this letter and send it.'
}

export function LettersSection({
  letters,
  deliveries,
  timeZone,
}: {
  letters: readonly { id: string; title: string }[]
  deliveries: readonly LetterDeliveryLine[]
  timeZone: string
}) {
  if (letters.length === 0) return null
  return (
    <section aria-labelledby="letters">
      <h2 id="letters">Letters</h2>
      <ul className="list-none space-y-1 p-0">
        {letters.map((l) => (
          <li key={l.id} className="flex flex-col">
            <a {...NEW_TAB} href={`/api/documents/${l.id}`}>
              {l.title}
            </a>
            {deliveries
              .filter((d) => d.documentId === l.id)
              .map((d) => (
                <span key={d.at.toISOString()} className="text-sm text-ink-secondary">
                  {deliveryText(d, timeZone)}
                </span>
              ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
