import { desc, eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { rosterReviews } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayManageAbutters } from '@/features/rosters/manage'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type RosterKind = (typeof rosterReviews.$inferInsert)['kind']

export interface RosterStatus {
  state: 'never_reviewed' | 'reviewed'
  reviewedOn: CivilDate | null
  ageDays: number | null
}

export async function rosterStatus(
  db: DbOrTx,
  kind: RosterKind,
  today: CivilDate,
  signal: AbortSignal,
): Promise<RosterStatus> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ reviewedOn: rosterReviews.reviewedOn })
    .from(rosterReviews)
    .where(eq(rosterReviews.kind, kind))
    .orderBy(desc(rosterReviews.reviewedOn), desc(rosterReviews.recordedAt))
    .limit(1)
  if (row === undefined) return { state: 'never_reviewed', reviewedOn: null, ageDays: null }
  const reviewedOn = row.reviewedOn as CivilDate
  return { state: 'reviewed', reviewedOn, ageDays: daysBetween(reviewedOn, today) }
}

export async function recordRosterReview(
  db: Db,
  actor: Actor,
  input: { kind: RosterKind; reviewedOn: CivilDate },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden'>> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return err('forbidden')
  await db.transaction(async (tx) => {
    await tx
      .insert(rosterReviews)
      .values({ kind: input.kind, reviewedOn: input.reviewedOn, reviewedBy: actor.userId })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'roster.review.record',
        entityType: 'roster',
        entityId: input.kind,
        after: { reviewedOn: input.reviewedOn },
      },
      signal,
    )
  })
  return ok(undefined)
}
