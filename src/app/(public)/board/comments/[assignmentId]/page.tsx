import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/ActionForm'
import { BoardRefusal } from '@/components/board/BoardRefusal'
import { LINK, NewTabLink } from '@/components/board/NewTabLink'
import { StatusChip } from '@/components/StatusChip'
import { AreaField } from '@/components/staff/fields'
import { DescriptionList } from '@/components/ui/description-list'
import { isBoardMember } from '@/features/access/predicates'
import { BOARD_HOME_TITLE } from '@/features/boards/memberCopy'
import {
  type BoardAssignmentView,
  getBoardAssignmentView,
} from '@/features/reviews/boardAssignmentView'
import { memberRequestChip } from '@/features/reviews/memberRequestStatus'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate, formatInstant } from '@/lib/formatDate'
import { requirePortalContext } from '@/server/requirePortal'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'
import { isUuid } from '@/utils/uuid'
import { postBoardCommentAction } from './actions'

export const metadata: Metadata = { title: 'Comment on an application' }

export const dynamic = 'force-dynamic'

const DEFAULT_ZONE = 'America/New_York'

function Facts({ view }: { view: BoardAssignmentView }) {
  return (
    <DescriptionList
      items={[
        { label: 'Board', value: view.boardShortName },
        {
          label: 'Comments by',
          value: view.commentBy === null ? null : formatCivilDate(view.commentBy),
        },
        {
          label: 'Application',
          value: `${view.typeLabel} ${view.number}, ${view.projectTitle}`.trim(),
        },
        { label: 'Site address', value: view.siteAddress },
        { label: 'Parcel', value: view.parcelDisplayId },
        { label: 'Description of work', value: view.workDescription },
      ]}
    />
  )
}

function Documents({ view }: { view: BoardAssignmentView }) {
  return (
    <section aria-label="Documents">
      <h2>Documents</h2>
      {view.documents.length === 0 ? (
        <p>No documents are shared with reviewers yet.</p>
      ) : (
        <>
          <p className="text-muted-foreground">Documents open in a new tab.</p>
          <ul className="list-none space-y-1 p-0">
            {view.documents.map((d) => (
              <li key={d.documentId}>
                <NewTabLink href={`/api/documents/${d.documentId}`}>{d.title}</NewTabLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Thread({ view, zone }: { view: BoardAssignmentView; zone: string }) {
  if (view.comments.length === 0) return <p>No comments from your board yet.</p>
  return (
    <ul className="list-none space-y-3 p-0">
      {view.comments.map((c) => (
        <li key={c.id} className="record-item">
          <blockquote className="m-0 border-l-4 border-hairline pl-4 whitespace-pre-line">
            {c.body}
          </blockquote>
          <p className="mt-1 mb-0 text-muted-foreground">
            {`${c.attribution}, ${formatInstant(c.createdAt, zone)}`}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Comments({ view, zone }: { view: BoardAssignmentView; zone: string }) {
  return (
    <section aria-label="Comments">
      <h2>Comments</h2>
      <Thread view={view} zone={zone} />
      {view.open ? (
        <ActionForm
          action={postBoardCommentAction}
          submitLabel="Post comment"
          variant="default"
          submitNote="You can't change a comment once posted."
        >
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

function Header({ view, today }: { view: BoardAssignmentView; today: CivilDate }) {
  const chip = memberRequestChip(view, today)
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <h1 className="m-0">{`Application ${view.number}, ${view.projectTitle}`}</h1>
      <StatusChip status={chip.status} label={chip.label} />
    </div>
  )
}

export default async function BoardCommentPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>
}) {
  const { assignmentId } = await params
  const ctx = await requirePortalContext(`/board/comments/${assignmentId}`)
  if (!isBoardMember(ctx.actor)) return <BoardRefusal />
  if (!isUuid(assignmentId)) notFound()
  const view = await getBoardAssignmentView(ctx.db, ctx.actor, assignmentId, ctx.signal)
  if (view === null) notFound()
  const town = await getTownSettings(ctx.db, ctx.signal)
  const zone = town.ok ? town.value.timeZone : DEFAULT_ZONE
  const today = todayInTimeZone(zone, new Date())
  return (
    <main className="space-y-6">
      <meta name="robots" content="noindex" />
      <p>
        <Link href="/board" className={LINK}>
          {BOARD_HOME_TITLE}
        </Link>
      </p>
      <Header view={view} today={today} />
      <section aria-label="About this request">
        <h2>About this request</h2>
        <Facts view={view} />
      </section>
      <Documents view={view} />
      <Comments view={view} zone={zone} />
    </main>
  )
}
