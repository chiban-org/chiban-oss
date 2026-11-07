import { START_EVENT_LABELS } from '@/features/clocks/explainClock'
import { type SubjectDue, subjectDueStatus } from '@/features/clocks/subjectDue'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

export function dueStatusText(due: SubjectDue, today: CivilDate): string {
  const { status, daysRemaining } = subjectDueStatus(due, today)
  if (status === 'due_today') return 'Due today.'
  if (status === 'passed')
    return `Passed ${-daysRemaining} ${-daysRemaining === 1 ? 'day' : 'days'} ago.`
  return `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left.`
}

export function consequenceText(due: SubjectDue, today: CivilDate): string {
  return subjectDueStatus(due, today).status === 'passed'
    ? due.consequence
    : `If the date passes: ${due.consequence}`
}

export function startLabelOf(due: SubjectDue): string {
  return START_EVENT_LABELS[due.startEvent] ?? due.startEvent
}

export function dueDateText(due: SubjectDue): string {
  return `Due ${formatCivilDate(due.due)}${due.rolledFrom === null ? '' : `, moved from ${formatCivilDate(due.rolledFrom)}`}.`
}

export function DueRule({ due }: { due: SubjectDue }) {
  const rule = ruleByKey(loadPack(), due.ruleKey, due.ruleVersion)
  return (
    <p className="font-medium">
      {rule.label}{' '}
      {rule.citation.url === null ? (
        `(${rule.citation.label})`
      ) : (
        <>
          (<a href={rule.citation.url}>{rule.citation.label}</a>)
        </>
      )}
    </p>
  )
}

export function DueLine({
  due,
  today,
  met = false,
}: {
  due: SubjectDue
  today: CivilDate
  met?: boolean
}) {
  return (
    <div className="space-y-1">
      <DueRule due={due} />
      <p>{`Starts: ${startLabelOf(due)}, ${formatCivilDate(due.startDate)}. ${humanizeIsoDates(due.countingMethod)}`}</p>
      <p>{met ? dueDateText(due) : `${dueDateText(due)} ${dueStatusText(due, today)}`}</p>
      {met ? null : <p>{consequenceText(due, today)}</p>}
    </div>
  )
}
