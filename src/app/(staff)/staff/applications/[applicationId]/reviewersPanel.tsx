import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { SelectField } from '@/components/staff/fields'
import type { ApplicationReviewer } from '@/features/reviews/reviewerView'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { assignReviewerAction, removeReviewerAction } from '../../reviews/actions'

interface Props {
  applicationId: string
  reviewers: ApplicationReviewer[]
  choices: { id: string; name: string }[]
  canAssign: boolean
  required?: boolean
}

function RemoveReviewer({ reviewer }: { reviewer: ApplicationReviewer }) {
  return (
    <details>
      <summary className="text-sm font-normal text-status-failed-fg">Remove</summary>
      <ActionForm
        action={removeReviewerAction}
        submitLabel={`Remove ${reviewer.name}`}
        variant="destructive"
        compact
      >
        <input type="hidden" name="assignmentId" value={reviewer.assignmentId} />
        <p className="m-0 mb-2 text-sm">{`${reviewer.name} will no longer see this application.`}</p>
      </ActionForm>
    </details>
  )
}

function Unassigned({ required }: { required: boolean }) {
  if (!required) return <p>No reviewer is assigned.</p>
  return (
    <p className="flex flex-wrap items-center gap-2">
      <StatusChip status="failed" label="No reviewer is assigned" />
      <span>The decision is blocked until a reviewer is assigned and signs off.</span>
    </p>
  )
}

export function ReviewersPanel({
  applicationId,
  reviewers,
  choices,
  canAssign,
  required = false,
}: Props) {
  const assigned = new Set(reviewers.map((r) => r.reviewerUserId))
  const offered = choices.filter((c) => !assigned.has(c.id))
  return (
    <section aria-label="Reviewers" id="reviewers">
      <h2>Reviewers</h2>
      {reviewers.length === 0 ? <Unassigned required={required} /> : null}
      <ul className="m-0 list-none p-0">
        {reviewers.map((r) => (
          <li
            key={r.assignmentId}
            className="record-item flex flex-wrap items-start justify-between gap-3 pb-3"
          >
            <span>{`${r.name}, ${reviewStatusLabel(r.status)}`}</span>
            {canAssign ? <RemoveReviewer reviewer={r} /> : null}
          </li>
        ))}
      </ul>
      {canAssign && offered.length > 0 ? (
        <details open={required && reviewers.length === 0}>
          <summary>Assign a reviewer</summary>
          <ActionForm action={assignReviewerAction} submitLabel="Assign reviewer">
            <input type="hidden" name="applicationId" value={applicationId} />
            <SelectField
              label="Reviewer"
              name="reviewerUserId"
              options={offered.map((c): [string, string] => [c.id, c.name])}
            />
          </ActionForm>
        </details>
      ) : null}
    </section>
  )
}
