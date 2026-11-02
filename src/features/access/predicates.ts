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

export function applicationVisibleTo(actor: Actor | null): SQL {
  if (actor === null) return NOTHING
  if (hasFullRecordAccess(actor)) return EVERYTHING
  const asParty = activePartyOf(actor.userId, applications.projectId)
  if (!isReviewer(actor)) return asParty
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
  return sql`(${asParty} or ${assigned})`
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
