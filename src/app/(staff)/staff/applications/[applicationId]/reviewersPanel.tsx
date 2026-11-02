import { ActionForm } from '@/components/ActionForm'
import { SelectField } from '@/components/staff/fields'
import type { ApplicationReviewer } from '@/features/reviews/reviewerView'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { assignReviewerAction, removeReviewerAction } from '../../reviews/actions'

interface Props {
  applicationId: string
  reviewers: ApplicationReviewer[]
  choices: { id: string; name: string }[]
  canAssign: boolean
}

export function ReviewersPanel({ applicationId, reviewers, choices, canAssign }: Props) {
  const assigned = new Set(reviewers.map((r) => r.reviewerUserId))
  const offered = choices.filter((c) => !assigned.has(c.id))
  return (
    <section aria-label="Reviewers">
      <h2>Reviewers</h2>
      {reviewers.length === 0 ? <p>No reviewer is assigned.</p> : null}
      <ul className="space-y-2">
        {reviewers.map((r) => (
          <li key={r.assignmentId}>
            {`${r.name}, ${reviewStatusLabel(r.status)}`}
            {canAssign ? (
              <ActionForm action={removeReviewerAction} submitLabel={`Remove ${r.name}`}>
                <input type="hidden" name="assignmentId" value={r.assignmentId} />
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
      {canAssign && offered.length > 0 ? (
        <ActionForm action={assignReviewerAction} submitLabel="Assign reviewer">
          <input type="hidden" name="applicationId" value={applicationId} />
          <SelectField
            label="Reviewer"
            name="reviewerUserId"
            options={offered.map((c): [string, string] => [c.id, c.name])}
          />
        </ActionForm>
      ) : null}
    </section>
  )
}
