import { ActionForm } from '@/components/ActionForm'
import { SelectField } from '@/components/staff/fields'
import type { ApplicationReviewer } from '@/features/reviews/reviewerView'
import { assignReviewerAction, removeReviewerAction } from '../../reviews/actions'

interface Props {
  applicationId: string
  reviewers: ApplicationReviewer[]
  choices: { id: string; name: string }[]
  canAssign: boolean
}

export function ReviewersPanel({ applicationId, reviewers, choices, canAssign }: Props) {
  return (
    <section aria-label="Reviewers">
      <h2>Reviewers</h2>
      {reviewers.length === 0 ? <p>No reviewer is assigned.</p> : null}
      <ul className="space-y-2">
        {reviewers.map((r) => (
          <li key={r.assignmentId}>
            {`${r.name}, ${r.status.replaceAll('_', ' ')}`}
            {canAssign ? (
              <ActionForm action={removeReviewerAction} submitLabel="Remove reviewer">
                <input type="hidden" name="assignmentId" value={r.assignmentId} />
              </ActionForm>
            ) : null}
          </li>
        ))}
      </ul>
      {canAssign && choices.length > 0 ? (
        <ActionForm action={assignReviewerAction} submitLabel="Assign reviewer">
          <input type="hidden" name="applicationId" value={applicationId} />
          <SelectField
            label="Reviewer"
            name="reviewerUserId"
            options={choices.map((c): [string, string] => [c.id, c.name])}
          />
        </ActionForm>
      ) : null}
    </section>
  )
}
