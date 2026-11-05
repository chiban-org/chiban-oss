import { and, eq, exists, isNull, or, type SQL, sql } from 'drizzle-orm'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import type { DbOrTx } from '@/db/client'
import { applications, reviewAssignments } from '@/db/schema'
import { isBoardMember, memberCanSeeApplication } from '@/features/access/predicates'
import { hasFullRecordAccess, isReviewer } from '@/features/access/roles'
import type { Actor } from '@/features/auth/actor'
import { ledgerEntryVisibleTo } from '@/features/ledger/visibility'
import { APPLICATIONS_PATH } from '@/features/queue/queueParams'
import { REQUESTS_PATH } from '@/features/rtk/requestListParams'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'

const ENFORCEMENT_PATH = '/staff/enforcement'
const sqlBuilder = new QueryBuilder()

export interface SearchScope {
  applications: SQL
  applicationList: boolean
  cases: boolean
  requests: boolean
  receipts: SQL | null
}

function assignedTo(userId: string): SQL {
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

export function staffApplicationVisibleTo(actor: Actor): SQL {
  if (hasFullRecordAccess(actor)) return sql`true`
  const ways = [
    isReviewer(actor) ? assignedTo(actor.userId) : null,
    isBoardMember(actor) ? memberCanSeeApplication(actor.userId, sql`${applications.id}`) : null,
  ].filter((way): way is SQL => way !== null)
  return or(...ways) ?? sql`false`
}

export async function loadSearchScope(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<SearchScope> {
  const viewer = await loadNavViewer(db, actor, signal)
  const fullRecords = hasFullRecordAccess(actor)
  return {
    applications: staffApplicationVisibleTo(actor),
    applicationList: mayOpen(APPLICATIONS_PATH, viewer),
    cases: fullRecords && mayOpen(ENFORCEMENT_PATH, viewer),
    requests: fullRecords && mayOpen(REQUESTS_PATH, viewer),
    receipts: fullRecords ? ledgerEntryVisibleTo(actor) : null,
  }
}
