import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { applications, reviewAssignments, reviewComments, userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { isReviewer } from '@/features/access/roles'
import { isTerminalState } from '@/features/applications/states'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { queueNotification } from '@/features/notifications/queue'
import { err, ok, type Result } from '@/types/result'

async function isActiveReviewer(db: DbOrTx, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.isActive, true), eq(userRoles.role, 'reviewer')))
    .limit(1)
  return rows.length > 0
}

export async function assignReviewer(
  db: DbOrTx,
  actor: Actor,
  input: { applicationId: string; reviewerUserId: string },
  signal: AbortSignal,
): Promise<
  Result<
    { assignmentId: string; alreadyAssigned: boolean },
    'forbidden' | 'not_a_reviewer' | 'not_found'
  >
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'review.assign', signal)
  if (!allowed.ok) return err('forbidden')
  if (!(await isActiveReviewer(db, input.reviewerUserId))) return err('not_a_reviewer')
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
  if (app === undefined) return err('not_found')
  return await transactionResult<
    { assignmentId: string; alreadyAssigned: boolean },
    'forbidden' | 'not_a_reviewer' | 'not_found'
  >(db, async (tx) => {
    const inserted = await tx
      .insert(reviewAssignments)
      .values({
        applicationId: input.applicationId,
        reviewerUserId: input.reviewerUserId,
        assignedBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning({ id: reviewAssignments.id })
    const created = inserted[0]
    if (created === undefined) {
      const [active] = await tx
        .select({ id: reviewAssignments.id })
        .from(reviewAssignments)
        .where(
          and(
            eq(reviewAssignments.applicationId, input.applicationId),
            eq(reviewAssignments.reviewerUserId, input.reviewerUserId),
            isNull(reviewAssignments.removedAt),
          ),
        )
      return ok({ assignmentId: active?.id ?? '', alreadyAssigned: true })
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'review.assign',
        entityType: 'application',
        entityId: input.applicationId,
        after: { reviewerUserId: input.reviewerUserId, assignmentId: created.id },
      },
      signal,
    )
    await queueNotification(
      tx,
      {
        event: 'review_assigned',
        applicationId: input.applicationId,
        recipientUserIds: [input.reviewerUserId],
        discriminator: created.id,
        extra: { assignmentId: created.id },
      },
      signal,
    )
    return ok({ assignmentId: created.id, alreadyAssigned: false })
  })
}

export async function removeReviewer(
  db: DbOrTx,
  actor: Actor,
  input: { assignmentId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'review.assign', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const removed = await tx
      .update(reviewAssignments)
      .set({ removedAt: new Date() })
      .where(and(eq(reviewAssignments.id, input.assignmentId), isNull(reviewAssignments.removedAt)))
      .returning({
        applicationId: reviewAssignments.applicationId,
        reviewerUserId: reviewAssignments.reviewerUserId,
      })
    const row = removed[0]
    if (row === undefined) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'review.unassign',
        entityType: 'application',
        entityId: row.applicationId,
        after: { reviewerUserId: row.reviewerUserId, assignmentId: input.assignmentId },
      },
      signal,
    )
    return ok(undefined)
  })
}

export type ReviewLockError = 'forbidden' | 'already_signed_off' | 'application_closed'

interface OwnAssignment {
  id: string
  applicationId: string
}

function ownActive(actor: Actor, assignmentId: string) {
  return and(
    eq(reviewAssignments.id, assignmentId),
    eq(reviewAssignments.reviewerUserId, actor.userId),
    isNull(reviewAssignments.removedAt),
  )
}

async function lockOpenAssignment(
  tx: Tx,
  actor: Actor,
  assignmentId: string,
): Promise<Result<OwnAssignment, ReviewLockError>> {
  if (!isReviewer(actor)) return err('forbidden')
  const [owned] = await tx
    .select({ applicationId: reviewAssignments.applicationId })
    .from(reviewAssignments)
    .where(ownActive(actor, assignmentId))
  if (owned === undefined) return err('forbidden')
  const [app] = await tx
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, owned.applicationId))
    .for('update')
  const [row] = await tx
    .select({ status: reviewAssignments.status })
    .from(reviewAssignments)
    .where(ownActive(actor, assignmentId))
    .for('update')
  if (app === undefined || row === undefined) return err('forbidden')
  if (isTerminalState(app.state)) return err('application_closed')
  if (row.status === 'signed_off') return err('already_signed_off')
  return ok({ id: assignmentId, applicationId: owned.applicationId })
}

export async function addReviewComment(
  db: DbOrTx,
  actor: Actor,
  input: { assignmentId: string; body: string },
  signal: AbortSignal,
): Promise<Result<void, ReviewLockError>> {
  signal.throwIfAborted()
  return await transactionResult(db, async (tx) => {
    const open = await lockOpenAssignment(tx, actor, input.assignmentId)
    if (!open.ok) return open
    const mine = open.value
    await tx.insert(reviewComments).values({ assignmentId: mine.id, body: input.body })
    await tx
      .update(reviewAssignments)
      .set({ status: 'commented' })
      .where(and(eq(reviewAssignments.id, mine.id), eq(reviewAssignments.status, 'pending')))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'review.comment',
        entityType: 'application',
        entityId: mine.applicationId,
        after: { assignmentId: mine.id },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function signOffReview(
  db: DbOrTx,
  actor: Actor,
  input: { assignmentId: string },
  signal: AbortSignal,
): Promise<Result<void, ReviewLockError>> {
  signal.throwIfAborted()
  return await transactionResult(db, async (tx) => {
    const open = await lockOpenAssignment(tx, actor, input.assignmentId)
    if (!open.ok) return open
    const mine = open.value
    await tx
      .update(reviewAssignments)
      .set({ status: 'signed_off', signedOffAt: new Date() })
      .where(eq(reviewAssignments.id, mine.id))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'review.sign_off',
        entityType: 'application',
        entityId: mine.applicationId,
        after: { assignmentId: mine.id },
      },
      signal,
    )
    return ok(undefined)
  })
}
