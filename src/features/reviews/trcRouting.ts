import { and, asc, eq, inArray } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import {
  acceptanceSchedules,
  boardMeetings,
  hearings,
  trcRoutings,
  userRoles,
  users,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { computeDue } from '@/features/clocks/computeDue'
import { getPublished } from '@/features/config/store'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { assignReviewer } from '@/features/reviews/assignments'
import type { ReviewRoutesBody } from '@/features/reviews/routesSchema'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type TrcError =
  | 'forbidden'
  | 'not_found'
  | 'no_route'
  | { departmentWithoutReviewer: string[] }

async function activeReviewers(db: DbOrTx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(inArray(users.id, ids), eq(users.isActive, true), eq(userRoles.role, 'reviewer')))
  return new Set(rows.map((r) => r.id))
}

async function meetingDateFor(
  db: DbOrTx,
  applicationId: string,
  meetingId: string | undefined,
): Promise<CivilDate | null> {
  const [byId] =
    meetingId === undefined
      ? []
      : await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId))
  if (byId !== undefined) return byId.meetingDate as CivilDate
  const [hearing] = await db
    .select({ date: boardMeetings.meetingDate })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .where(eq(hearings.applicationId, applicationId))
    .orderBy(asc(boardMeetings.meetingDate))
    .limit(1)
  if (hearing !== undefined) return hearing.date as CivilDate
  const [accept] = await db
    .select({ date: boardMeetings.meetingDate })
    .from(acceptanceSchedules)
    .innerJoin(boardMeetings, eq(boardMeetings.id, acceptanceSchedules.meetingId))
    .where(eq(acceptanceSchedules.applicationId, applicationId))
  return (accept?.date as CivilDate | undefined) ?? null
}

export async function routeToTrc(
  db: Db,
  actor: Actor,
  input: { applicationId: string; meetingId?: string },
  signal: AbortSignal,
): Promise<Result<{ assigned: number }, TrcError>> {
  signal.throwIfAborted()
  if (!(await requireCapability(db, actor.userId, 'review.assign', signal)).ok) {
    return err('forbidden')
  }
  return await transactionResult<{ assigned: number }, TrcError>(db, async (tx) => {
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    const published = await getPublished(tx, 'review_routes', 'default', signal)
    const config = published?.body as ReviewRoutesBody | undefined
    const route = config?.routes.find((r) => r.applicationTypeKey === app.typeBody.key)
    if (config === undefined || route === undefined) return err('no_route')
    const routed = new Set(
      (
        await tx
          .select({ key: trcRoutings.departmentKey })
          .from(trcRoutings)
          .where(eq(trcRoutings.applicationId, app.id))
      ).map((r) => r.key),
    )
    const pending = config.departments.filter(
      (d) => route.departmentKeys.includes(d.key) && !routed.has(d.key),
    )
    const active = await activeReviewers(
      tx,
      pending.flatMap((d) => d.reviewerUserIds),
    )
    const chosen = pending.map((d) => ({
      department: d,
      reviewerId: d.reviewerUserIds.find((id) => active.has(id)),
    }))
    const missing = chosen.filter((c) => c.reviewerId === undefined).map((c) => c.department.label)
    if (missing.length > 0) return err({ departmentWithoutReviewer: missing })
    const meetingDate = await meetingDateFor(tx, app.id, input.meetingId)
    const commentDue =
      meetingDate === null
        ? null
        : computeDue({
            start: meetingDate,
            length: { unit: 'days', value: route.commentDueDaysBeforeMeeting },
            direction: 'before',
            clockType: 'notice_lead',
            holidays: packHolidayCalendar(),
          }).due
    for (const { department, reviewerId } of chosen) {
      const assigned = await assignReviewer(
        tx,
        actor,
        { applicationId: app.id, reviewerUserId: reviewerId ?? '' },
        signal,
      )
      if (!assigned.ok) return err(assigned.error === 'not_found' ? 'not_found' : 'forbidden')
      await tx.insert(trcRoutings).values({
        applicationId: app.id,
        departmentKey: department.key,
        assignmentId: assigned.value.assignmentId,
        commentDue,
      })
    }
    return ok({ assigned: chosen.length })
  })
}
