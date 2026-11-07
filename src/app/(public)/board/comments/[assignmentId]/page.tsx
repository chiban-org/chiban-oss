import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { NEW_TAB } from '@/components/newTab'
import { AreaField } from '@/components/staff/fields'
import { isBoardMember } from '@/features/access/predicates'
import {
  type BoardAssignmentView,
  getBoardAssignmentView,
} from '@/features/reviews/boardAssignmentView'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate, formatInstant } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'
import { isUuid } from '@/utils/uuid'
import { postBoardCommentAction } from './actions'

export const metadata: Metadata = { title: 'Comment on an application' }

export const dynamic = 'force-dynamic'

const LINK = 'tap-target inline-flex items-center'
const DEFAULT_ZONE = 'America/New_York'

function Facts({ view }: { view: BoardAssignmentView }) {
  return (
    <div className="space-y-1">
      <p className="m-0">{`Sent to the ${view.boardName} for comment.`}</p>
      {view.commentBy === null ? null : (
        <p className="m-0">{`Comments by ${formatCivilDate(view.commentBy)}.`}</p>
      )}
      <p className="m-0">{view.statusLabel}</p>
      <p className="m-0">
        {view.parcelDisplayId === null
          ? view.typeLabel
          : `${view.typeLabel}, parcel ${view.parcelDisplayId}`}
      </p>
    </div>
  )
}

function Documents({ view }: { view: BoardAssignmentView }) {
  return (
    <section aria-label="Documents">
      <h2>Documents</h2>
      {view.documents.length === 0 ? <p>No documents are shared with reviewers yet.</p> : null}
      <ul className="list-none space-y-1 p-0">
        {view.documents.map((d) => (
          <li key={d.documentId}>
            <a {...NEW_TAB} className={LINK} href={`/api/documents/${d.documentId}`}>
              {d.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Comments({ view, zone }: { view: BoardAssignmentView; zone: string }) {
  return (
    <section aria-label="Comments">
      <h2>Comments</h2>
      {view.comments.length === 0 ? <p>No comments from your board yet.</p> : null}
      <ul className="list-none divide-y p-0">
        {view.comments.map((c) => (
          <li key={c.id} className="py-3">
            <p className="m-0 whitespace-pre-line">{c.body}</p>
            <p className="m-0">{`${c.attribution}, ${formatInstant(c.createdAt, zone)}`}</p>
          </li>
        ))}
      </ul>
      {view.open ? (
        <ActionForm action={postBoardCommentAction} submitLabel="Post comment">
          <input type="hidden" name="assignmentId" value={view.assignmentId} />
          <AreaField
            label="Comment"
            name="body"
            required
            rows={5}
            hint="The land use office and the other members of your board can read it."
          />
        </ActionForm>
      ) : (
        <p>This application is finished, so comments can no longer be added.</p>
      )}
    </section>
  )
}

export default async function BoardCommentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>
}) {
  const { assignmentId } = await params
  const ctx = await requirePortalContext(`/board/comments/${assignmentId}`)
  if (!isUuid(assignmentId) || !isBoardMember(ctx.actor)) notFound()
  const view = await getBoardAssignmentView(ctx.db, ctx.actor, assignmentId, ctx.signal)
  if (view === null) notFound()
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  return (
    <main className="space-y-6">
      <meta name="robots" content="noindex" />
      <p>
        <Link href="/board" className={LINK}>
          Board meetings and comment requests
        </Link>
      </p>
      <h1>{`Application ${view.number}, ${view.projectTitle}`}</h1>
      <Facts view={view} />
      <Documents view={view} />
      <Comments view={view} zone={zone} />
    </main>
  )
}
