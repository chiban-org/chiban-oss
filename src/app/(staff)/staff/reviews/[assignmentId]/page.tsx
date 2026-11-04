import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { AreaField } from '@/components/staff/fields'
import { type AssignmentView, getAssignmentView, reviewOpen } from '@/features/reviews/reviewerView'
import { getTownSettings } from '@/features/town/settings'
import { formatInstant } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { addReviewCommentAction } from '../actions'
import { ReviewRail } from './reviewRail'

export const dynamic = 'force-dynamic'

const DEFAULT_ZONE = 'America/New_York'

function DocumentsSection({ view }: { view: AssignmentView }) {
  return (
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
  )
}

function CommentsSection({ view, zone }: { view: AssignmentView; zone: string }) {
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
  const sections = splitPanels([
    { empty: false, node: <CommentsSection key="comments" view={view} zone={zone} /> },
    {
      empty: view.documents.length === 0,
      node: <DocumentsSection key="documents" view={view} />,
    },
  ])
  return (
    <main>
      <PageHeader
        kicker={view.typeLabel}
        title={`Review ${view.number}`}
        lead={view.projectTitle}
      />
      <RecordLayout rail={<ReviewRail view={view} />} empty={sections.empty}>
        {sections.filled}
      </RecordLayout>
    </main>
  )
}
