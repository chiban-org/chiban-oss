import { asc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { reviewAssignments, reviewComments, trcRoutings, users } from '@/db/schema'
import { hasFullRecordAccess } from '@/features/access/roles'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { getPublished } from '@/features/config/store'
import { documentFrame } from '@/features/pdf/documentFrame'
import { renderPdf } from '@/features/pdf/renderPdf'
import type { ReviewRoutesBody } from '@/features/reviews/routesSchema'
import { reviewStatusLabel } from '@/features/reviews/statusLabels'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { words } from '@/lib/words'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface TrcDepartmentSummary {
  departmentKey: string
  departmentLabel: string
  reviewerName: string
  status: 'pending' | 'commented' | 'signed_off'
  commentDue: CivilDate | null
  overdue: boolean
  comments: { body: string; createdAt: Date }[]
}

export async function trcSummary(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
  today?: CivilDate,
): Promise<Result<TrcDepartmentSummary[], 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!hasFullRecordAccess(actor)) return err('forbidden')
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return err('not_found')
  const now = today ?? (await townToday(db, new Date(), signal))
  const published = await getPublished(db, 'review_routes', 'default', signal)
  const labels = new Map(
    ((published?.body as ReviewRoutesBody | undefined)?.departments ?? []).map((d) => [
      d.key,
      d.label,
    ]),
  )
  const rows = await db
    .select({
      departmentKey: trcRoutings.departmentKey,
      commentDue: trcRoutings.commentDue,
      assignmentId: reviewAssignments.id,
      status: reviewAssignments.status,
      reviewerName: users.displayName,
    })
    .from(trcRoutings)
    .innerJoin(reviewAssignments, eq(reviewAssignments.id, trcRoutings.assignmentId))
    .innerJoin(users, eq(users.id, reviewAssignments.reviewerUserId))
    .where(eq(trcRoutings.applicationId, applicationId))
    .orderBy(asc(trcRoutings.departmentKey))
  const summaries: TrcDepartmentSummary[] = []
  for (const row of rows) {
    const comments = await db
      .select({ body: reviewComments.body, createdAt: reviewComments.createdAt })
      .from(reviewComments)
      .where(eq(reviewComments.assignmentId, row.assignmentId))
      .orderBy(asc(reviewComments.createdAt))
    const due = row.commentDue as CivilDate | null
    summaries.push({
      departmentKey: row.departmentKey,
      departmentLabel: labels.get(row.departmentKey) ?? words(row.departmentKey),
      reviewerName: row.reviewerName,
      status: row.status,
      commentDue: due,
      overdue: due !== null && row.status !== 'signed_off' && compareCivil(now, due) > 0,
      comments,
    })
  }
  return ok(summaries)
}

export async function trcSummaryPdf(
  db: Db,
  actor: Actor,
  applicationId: string,
  signal: AbortSignal,
): Promise<Result<Uint8Array, 'forbidden' | 'not_found' | 'empty'>> {
  const summary = await trcSummary(db, actor, applicationId, signal)
  if (!summary.ok) return summary
  if (summary.value.length === 0) return err('empty')
  const app = await loadApplicationContext(db, applicationId, signal)
  const bytes = await renderPdf({
    title: 'Technical Review Committee summary',
    subtitle: app?.number ?? '',
    frame: await documentFrame(db, {}, signal),
    scale: 'document',
    blocks: [
      {
        kind: 'table',
        columns: ['Department', 'Reviewer', 'Status', 'Comments due'],
        rows: summary.value.map((s) => [
          s.departmentLabel,
          s.reviewerName,
          s.overdue ? `${reviewStatusLabel(s.status)}, overdue` : reviewStatusLabel(s.status),
          s.commentDue === null ? 'Not set' : formatCivilDate(s.commentDue),
        ]),
      },
      ...summary.value.flatMap((s) =>
        s.comments.length === 0
          ? []
          : [
              { kind: 'heading' as const, text: s.departmentLabel },
              ...s.comments.map((c) => ({ kind: 'paragraph' as const, text: c.body })),
            ],
      ),
    ],
  })
  return ok(bytes)
}
