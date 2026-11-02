import Link from 'next/link'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'

interface Props {
  assignments: { assignmentId: string; number: string; status: string }[]
}

export function AssignmentList({ assignments }: Props) {
  return (
    <ul className="space-y-2">
      {assignments.map((a) => (
        <li key={a.assignmentId}>
          <Link href={`/staff/reviews/${a.assignmentId}`} className="text-action underline">
            {a.number}
          </Link>
          <span className="ml-2">{reviewStatusLabel(a.status)}</span>
        </li>
      ))}
    </ul>
  )
}
