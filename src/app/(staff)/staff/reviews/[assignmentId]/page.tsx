import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/layout/PageHeader'
import { RecordLayout } from '@/components/layout/RecordLayout'
import { splitPanels } from '@/components/layout/splitPanels'
import { NEW_TAB } from '@/components/newTab'
import { NoPermission } from '@/components/staff/NoPermission'
import { recordExists } from '@/features/access/recordExists'
import { type AssignmentView, getAssignmentView } from '@/features/reviews/reviewerView'
import { getTownSettings } from '@/features/town/settings'
import { formatInstant } from '@/lib/formatDate'
import { requireStaffContext } from '@/server/requireStaff'
import { isUuid } from '@/utils/uuid'
import { CommentsSection } from './commentsSection'
import { ReviewRail } from './reviewRail'

export const metadata: Metadata = { title: 'Review' }

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
            <a {...NEW_TAB} href={`/api/documents/${d.documentId}`}>
              {d.title}
            </a>
          </li>
        ))}
      </ul>
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
  if (view === null) {
    if (await recordExists(ctx.db, 'review', assignmentId, ctx.signal)) {
      return <NoPermission title="Review" action="open this review" />
    }
    notFound()
  }
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
