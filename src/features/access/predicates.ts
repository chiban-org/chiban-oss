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

export function activeMembershipOn(userId: string | SQL, boardColumn: SQL): SQL {
  return sql`exists (select 1 from board_memberships bm
    where bm.user_id = ${userId} and bm.board = ${boardColumn}
      and bm.term_start <= ${TOWN_TODAY} and (bm.term_end is null or bm.term_end >= ${TOWN_TODAY}))`
}

export function memberCanSeeApplication(userId: string, applicationIdColumn: SQL): SQL {
  return sql`exists (select 1 from hearings h
    join board_meetings m on m.id = h.meeting_id and m.status = 'scheduled'
    join agendas a on a.meeting_id = m.id and a.status = 'published'
    where h.application_id = ${applicationIdColumn}
      and ${activeMembershipOn(userId, sql`m.board`)})`
}

export function memberCanSeeMeeting(userId: string, meetingIdColumn: SQL): SQL {
  return sql`exists (select 1 from board_meetings m
    join agendas a on a.meeting_id = m.id and a.status = 'published'
    where m.id = ${meetingIdColumn} and m.status = 'scheduled'
      and ${activeMembershipOn(userId, sql`m.board`)})`
}

export function applicationVisibleTo(actor: Actor | null): SQL {
  if (actor === null) return NOTHING
  if (hasFullRecordAccess(actor)) return EVERYTHING
  const asParty = activePartyOf(actor.userId, applications.projectId)
  const asMember = isBoardMember(actor)
    ? memberCanSeeApplication(actor.userId, sql`${applications.id}`)
    : null
  if (!isReviewer(actor)) return asMember === null ? asParty : sql`(${asParty} or ${asMember})`
  const assigned = exists(
    sqlBuilder
      .select({ one: reviewAssignments.id })
      .from(reviewAssignments)
      .where(
        and(
          eq(reviewAssignments.applicationId, applications.id),
          eq(reviewAssignments.reviewerUserId, actor.userId),
          isNull(reviewAssignments.removedAt),
        ),
      ),
  )
  return asMember === null
    ? sql`(${asParty} or ${assigned})`
    : sql`(${asParty} or ${assigned} or ${asMember})`
}

export function projectVisibleTo(actor: Actor | null): SQL {
  if (actor === null) return NOTHING
  if (hasFullRecordAccess(actor)) return EVERYTHING
  const asParty = activePartyOf(actor.userId, projects.id)
  if (!isReviewer(actor)) return asParty
  const assignedInside = exists(
    sqlBuilder
      .select({ one: reviewAssignments.id })
      .from(reviewAssignments)
      .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
      .where(
        and(
          eq(applications.projectId, projects.id),
          eq(reviewAssignments.reviewerUserId, actor.userId),
          isNull(reviewAssignments.removedAt),
        ),
      ),
  )
  return sql`(${asParty} or ${assignedInside})`
}
