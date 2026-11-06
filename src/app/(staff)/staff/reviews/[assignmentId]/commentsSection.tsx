import { ActionForm } from '@/components/ActionForm'
import { AreaField } from '@/components/staff/fields'
import { type AssignmentView, reviewOpen } from '@/features/reviews/reviewerView'
import { formatInstant } from '@/lib/formatDate'
import { addReviewCommentAction } from '../actions'

export function CommentsSection({ view, zone }: { view: AssignmentView; zone: string }) {
  return (
    <section aria-label="Comments">
      <h2>Your comments</h2>
      {view.comments.length === 0 ? <p>No comments yet.</p> : null}
      <ul className="space-y-2">
        {view.comments.map((c) => (
          <li key={`${c.createdAt.toISOString()}-${c.body}`}>
            {`${formatInstant(c.createdAt, zone)}: ${c.body}`}
          </li>
        ))}
      </ul>
      {reviewOpen(view) ? (
        <ActionForm action={addReviewCommentAction} submitLabel="Add comment">
          <input type="hidden" name="assignmentId" value={view.assignmentId} />
          <AreaField label="Comment" name="body" required rows={4} />
        </ActionForm>
      ) : null}
    </section>
  )
}
