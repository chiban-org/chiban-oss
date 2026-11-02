import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { AreaField } from '@/components/staff/fields'
import { getAssignmentView } from '@/features/reviews/reviewerView'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { getTownSettings } from '@/features/town/settings'
import { formatInstant } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { addReviewCommentAction, signOffReviewAction } from '../actions'

export const dynamic = 'force-dynamic'

const DEFAULT_ZONE = 'America/New_York'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>
}) {
  const { assignmentId } = await params
  const ctx = await requireStaffContext()
  if (!isUuid(assignmentId)) notFound()
  const view = await getAssignmentView(ctx.db, ctx.actor, assignmentId, ctx.signal)
  if (view === null) notFound()
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  return (
    <main className="space-y-6">
      <h1>{`Review ${view.number}`}</h1>
      <p>{`Status: ${reviewStatusLabel(view.status)}`}</p>
      <section aria-label="Documents">
        <h2>Documents</h2>
        {view.documents.length === 0 ? <p>No documents are shared with reviewers.</p> : null}
        <ul className="space-y-1">
          {view.documents.map((d) => (
            <li key={d.documentId}>
              <a href={`/api/documents/${d.documentId}`} className="text-action underline">
                {d.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="Comments">
        <h2>Comments</h2>
        {view.comments.length === 0 ? <p>No comments yet.</p> : null}
        <ul className="space-y-2">
          {view.comments.map((c) => (
            <li key={`${c.createdAt.toISOString()}-${c.body}`}>
              {`${formatInstant(c.createdAt, zone)}: ${c.body}`}
            </li>
          ))}
        </ul>
        <ActionForm action={addReviewCommentAction} submitLabel="Add comment">
          <input type="hidden" name="assignmentId" value={view.assignmentId} />
          <AreaField label="Comment" name="body" required rows={4} />
        </ActionForm>
      </section>
      {view.status === 'signed_off' ? (
        <p>You signed off on this review.</p>
      ) : (
        <ActionForm action={signOffReviewAction} submitLabel="Sign off" variant="default">
          <input type="hidden" name="assignmentId" value={view.assignmentId} />
        </ActionForm>
      )}
    </main>
  )
}
