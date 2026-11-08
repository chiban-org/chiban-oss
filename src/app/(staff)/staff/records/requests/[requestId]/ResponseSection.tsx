import { NEW_TAB } from '@/components/newTab'
import { costTotal, responseLabel } from '@/features/rtk/labels'
import type { RtkRequestView } from '@/features/rtk/requests'
import { formatCivilDate } from '@/lib/formatDate'

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

export function LettersSection({ letters }: { letters: readonly { id: string; title: string }[] }) {
  if (letters.length === 0) return null
  return (
    <section aria-labelledby="letters">
      <h2 id="letters">Letters</h2>
      <ul className="list-none space-y-1 p-0">
        {letters.map((l) => (
          <li key={l.id}>
            <a {...NEW_TAB} href={`/api/documents/${l.id}`}>
              {l.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
