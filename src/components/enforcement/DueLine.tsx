import { START_EVENT_LABELS } from '@/features/clocks/explainClock'
import { type SubjectDue, subjectDueStatus } from '@/features/clocks/subjectDue'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

function statusText(due: SubjectDue, today: CivilDate): string {
  const { status, daysRemaining } = subjectDueStatus(due, today)
  if (status === 'due_today') return 'Due today.'
  if (status === 'passed')
    return `Passed ${-daysRemaining} ${-daysRemaining === 1 ? 'day' : 'days'} ago.`
  return `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left.`
}

export function DueLine({ due, today }: { due: SubjectDue; today: CivilDate }) {
  const rule = ruleByKey(loadPack(), due.ruleKey, due.ruleVersion)
  const startLabel = START_EVENT_LABELS[due.startEvent] ?? due.startEvent
  return (
    <div className="space-y-1">
      <p className="m-0 font-medium">
        {rule.label}{' '}
        {rule.citation.url === null ? (
          `(${rule.citation.label})`
        ) : (
          <>
            (
            <a href={rule.citation.url} className="text-action underline">
              {rule.citation.label}
            </a>
            )
          </>
        )}
      </p>
      <p className="m-0">{`Starts: ${startLabel}, ${formatCivilDate(due.startDate)}. ${humanizeIsoDates(due.countingMethod)}`}</p>
      <p className="m-0">
        {`Due ${formatCivilDate(due.due)}`}
        {due.rolledFrom === null ? '' : `, moved from ${formatCivilDate(due.rolledFrom)}`}
        {`. ${statusText(due, today)}`}
      </p>
      <p className="m-0">{due.consequence}</p>
    </div>
  )
}
