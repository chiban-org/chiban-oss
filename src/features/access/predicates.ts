import { and, eq, exists, isNull, type SQL, sql } from 'drizzle-orm'
import { type PgColumn, QueryBuilder } from 'drizzle-orm/pg-core'
import { applications, projectParties, projects, reviewAssignments } from '@/db/schema'
import { hasFullRecordAccess, isReviewer } from '@/features/access/roles'
import type { Actor } from '@/features/auth/actor'

const sqlBuilder = new QueryBuilder()
const NOTHING = sql`false`
const EVERYTHING = sql`true`

function activePartyOf(userId: string, projectIdColumn: PgColumn): SQL {
  return exists(
    sqlBuilder
      .select({ one: projectParties.id })
      .from(projectParties)
      .where(
        and(
          eq(projectParties.projectId, projectIdColumn),
          eq(projectParties.userId, userId),
          isNull(projectParties.removedAt),
        ),
      ),
  )
}

export const TOWN_TODAY = sql`(now() at time zone coalesce((select time_zone from town_settings limit 1), 'America/New_York'))::date`

export function isBoardMember(actor: Actor): boolean {
  return actor.roles.includes('board_member')
}

export function activeMembershipOn(userId: string | SQL, boardIdColumn: SQL): SQL {
  return sql`exists (select 1 from board_memberships bm
    where bm.user_id = ${userId} and bm.board_id = ${boardIdColumn}
      and bm.term_start <= ${TOWN_TODAY} and (bm.term_end is null or bm.term_end >= ${TOWN_TODAY}))`
}

export function memberCanSeeApplication(userId: string, applicationIdColumn: SQL): SQL {
  return sql`exists (select 1 from hearings h
    join board_meetings m on m.id = h.meeting_id and m.status = 'scheduled'
    join agendas a on a.meeting_id = m.id and a.status = 'published'
    join agenda_items ai on ai.meeting_id = m.id and ai.hearing_id = h.id
    where h.application_id = ${applicationIdColumn}
      and h.status in ('scheduled', 'held')
      and ${activeMembershipOn(userId, sql`m.board_id`)})`
}

export function memberCanSeeMeeting(userId: string, meetingIdColumn: SQL): SQL {
  return sql`exists (select 1 from board_meetings m
    join agendas a on a.meeting_id = m.id and a.status = 'published'
    where m.id = ${meetingIdColumn} and m.status = 'scheduled'
      and ${activeMembershipOn(userId, sql`m.board_id`)})`
}

export function memberOfAssignedBoard(userId: string, applicationIdColumn: SQL): SQL {
  return sql`exists (select 1 from review_assignments ra
    where ra.application_id = ${applicationIdColumn} and ra.removed_at is null
      and ra.board_id is not null and ${activeMembershipOn(userId, sql`ra.board_id`)})`
}

export function memberOfAssignedBoardInProject(userId: string, projectIdColumn: SQL): SQL {
  return sql`exists (select 1 from applications pa
    where pa.project_id = ${projectIdColumn}
      and ${memberOfAssignedBoard(userId, sql`pa.id`)})`
}

export function applicationPartyOf(actor: Actor | null): SQL {
  return actor === null ? NOTHING : activePartyOf(actor.userId, applications.projectId)
}

function anyOf(ways: (SQL | null)[]): SQL {
  const present = ways.filter((way): way is SQL => way !== null)
  return present.length === 1 ? (present[0] ?? NOTHING) : sql`(${sql.join(present, sql` or `)})`
}

function reviewerAssigned(userId: string): SQL {
  return exists(
    sqlBuilder
      .select({ one: reviewAssignments.id })
      .from(reviewAssignments)
      .where(
        and(
          eq(reviewAssignments.applicationId, applications.id),
          eq(reviewAssignments.reviewerUserId, userId),
          isNull(reviewAssignments.removedAt),
        ),
      ),
  )
}

function reviewerAssignedInside(userId: string): SQL {
  return exists(
    sqlBuilder
      .select({ one: reviewAssignments.id })
      .from(reviewAssignments)
      .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
      .where(
        and(
          eq(applications.projectId, projects.id),
          eq(reviewAssignments.reviewerUserId, userId),
          isNull(reviewAssignments.removedAt),
        ),
      ),
  )
}

export function applicationVisibleTo(actor: Actor | null): SQL {
  if (actor === null) return NOTHING
  if (hasFullRecordAccess(actor)) return EVERYTHING
  const member = isBoardMember(actor)
  const appId = sql`${applications.id}`
  return anyOf([
    activePartyOf(actor.userId, applications.projectId),
    isReviewer(actor) ? reviewerAssigned(actor.userId) : null,
    member ? memberCanSeeApplication(actor.userId, appId) : null,
    member ? memberOfAssignedBoard(actor.userId, appId) : null,
  ])
}

export function projectVisibleTo(actor: Actor | null): SQL {
  if (actor === null) return NOTHING
  if (hasFullRecordAccess(actor)) return EVERYTHING
  return anyOf([
    activePartyOf(actor.userId, projects.id),
    isReviewer(actor) ? reviewerAssignedInside(actor.userId) : null,
    isBoardMember(actor) ? memberOfAssignedBoardInProject(actor.userId, sql`${projects.id}`) : null,
  ])
}
