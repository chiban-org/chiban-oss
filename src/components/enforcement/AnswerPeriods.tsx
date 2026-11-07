import type { SubjectDue } from '@/features/clocks/subjectDue'
import { formatCivilDate, humanizeIsoDates } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'
import { consequenceText, DueRule, dueDateText, dueStatusText, startLabelOf } from './DueLine'

export interface AnswerDue {
  recipientId: string
  name: string
  due: SubjectDue
  answeredOn: string | null
}

function AnswerRow({ answer, today }: { answer: AnswerDue; today: CivilDate }) {
  const head = `${answer.name}: served ${formatCivilDate(answer.due.startDate)}. ${dueDateText(answer.due)} `
  return (
    <li className="record-item">
      {head}
      {answer.answeredOn === null ? (
        dueStatusText(answer.due, today)
      ) : (
        <span>{`Answer received ${formatCivilDate(answer.answeredOn)}.`}</span>
      )}
    </li>
  )
}

export function AnswerPeriods({ dues, today }: { dues: readonly AnswerDue[]; today: CivilDate }) {
  const first = dues[0]
  if (first === undefined) {
    return <p>No answer period is running. It starts when a recipient is served.</p>
  }
  const open = dues.find((a) => a.answeredOn === null)
  return (
    <div className="space-y-1">
      <DueRule due={first.due} />
      <p>{`Starts: ${startLabelOf(first.due)}, for each recipient. ${humanizeIsoDates(first.due.countingMethod)}`}</p>
      {open === undefined ? null : <p>{consequenceText(open.due, today)}</p>}
      <ul className="list-none p-0">
        {dues.map((a) => (
          <AnswerRow key={a.recipientId} answer={a} today={today} />
        ))}
      </ul>
    </div>
  )
}
