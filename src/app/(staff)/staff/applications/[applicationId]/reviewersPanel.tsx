import { ActionForm } from '@/components/ActionForm'
import { StatusChip } from '@/components/StatusChip'
import { SelectField } from '@/components/staff/fields'
import type { ApplicationBoardAssignment } from '@/features/reviews/boardAssignmentView'
import type { ApplicationReviewer, ReviewerWithComments } from '@/features/reviews/reviewerView'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { formatInstant } from '@/lib/formatDate'
import { assignReviewerAction, removeReviewerAction } from '../../reviews/actions'
import { BoardComments } from './boardComments'

interface Props {
  applicationId: string
  reviewers: ReviewerWithComments[]
  zone: string
  choices: { id: string; name: string }[]
  canAssign: boolean
  required?: boolean
  assignElsewhere?: boolean
  boards?: {
    assignments: ApplicationBoardAssignment[]
    choices: { id: string; name: string }[]
    canManage: boolean
    zone: string
  }
}

type Variant = 'default' | 'outline'

export function offeredReviewers(
  reviewers: Pick<ApplicationReviewer, 'reviewerUserId'>[],
  choices: { id: string; name: string }[],
) {
  const assigned = new Set(reviewers.map((r) => r.reviewerUserId))
  return choices.filter((c) => !assigned.has(c.id))
}

export function AssignReviewerForm({
  applicationId,
  offered,
  variant = 'outline',
}: {
  applicationId: string
  offered: { id: string; name: string }[]
  variant?: Variant
}) {
  return (
    <ActionForm action={assignReviewerAction} submitLabel="Assign reviewer" variant={variant}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <SelectField
        label="Reviewer"
        name="reviewerUserId"
        options={offered.map((c): [string, string] => [c.id, c.name])}
      />
    </ActionForm>
  )
}

function RemoveReviewer({ reviewer }: { reviewer: ApplicationReviewer }) {
  return (
    <details>
      <summary
        aria-label={`Remove ${reviewer.name}`}
        className="text-sm font-normal text-status-failed-fg"
      >
        Remove
      </summary>
      <ActionForm
        action={removeReviewerAction}
        submitLabel={`Remove ${reviewer.name}`}
        variant="destructive"
        compact
        confirm={{
          title: `Remove ${reviewer.name}?`,
          body: `${reviewer.name} will no longer see this application.`,
          confirmLabel: 'Remove the reviewer',
        }}
      >
        <input type="hidden" name="assignmentId" value={reviewer.assignmentId} />
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

function ReviewerComments({ reviewer, zone }: { reviewer: ReviewerWithComments; zone: string }) {
  if (reviewer.comments.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">No comments yet.</p>
  }
  return (
    <ul aria-label={`Comments from ${reviewer.name}`} className="space-y-2 pl-4">
      {reviewer.comments.map((c) => (
        <li key={`${c.createdAt.toISOString()}-${c.body}`}>
          <p className="m-0 whitespace-pre-line">{c.body}</p>
          <p className="m-0 text-sm text-muted-foreground">
            {`${reviewer.name}, ${formatInstant(c.createdAt, zone)}`}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function ReviewersPanel({
  applicationId,
  reviewers,
  zone,
  choices,
  canAssign,
  required = false,
  assignElsewhere = false,
  boards,
}: Props) {
  const offered = offeredReviewers(reviewers, choices)
  return (
    <section aria-label="Reviewers" id="reviewers">
      <h2>Reviewers</h2>
      {reviewers.length === 0 ? <Unassigned required={required} /> : null}
      <ul className="list-none p-0">
        {reviewers.map((r) => (
          <li key={r.assignmentId} className="record-item space-y-2 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <span>{`${r.name}, ${reviewStatusLabel(r.status)}`}</span>
              {canAssign ? <RemoveReviewer reviewer={r} /> : null}
            </div>
            <ReviewerComments reviewer={r} zone={zone} />
          </li>
        ))}
      </ul>
      {canAssign && offered.length > 0 && !assignElsewhere ? (
        <details open={required && reviewers.length === 0}>
          <summary>Assign a reviewer</summary>
          <AssignReviewerForm applicationId={applicationId} offered={offered} />
        </details>
      ) : null}
      {boards === undefined ? null : (
        <BoardComments
          applicationId={applicationId}
          assignments={boards.assignments}
          choices={boards.choices}
          canManage={boards.canManage}
          zone={boards.zone}
        />
      )}
    </section>
  )
}
