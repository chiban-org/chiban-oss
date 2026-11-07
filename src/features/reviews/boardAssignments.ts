import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { applications, projects, reviewAssignments } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { isTerminalState } from '@/features/applications/states'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { boardOfApplication } from '@/features/boards/boardOf'
import { boardMembersOf } from '@/features/boards/packetSend'
import { activeBoards, type BoardRow, boardForKind } from '@/features/boards/townBoards'
import { queueNotification } from '@/features/notifications/queue'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type BoardAssignError =
  | 'forbidden'
  | 'not_found'
  | 'application_closed'
  | 'board_not_assignable'

export interface BoardAssigned {
  assignmentId: string
  alreadyAssigned: boolean
  notified: number
}

export async function assignableBoards(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
): Promise<BoardRow[]> {
  const app = await loadApplicationContext(db, applicationId, signal)
  if (app === null) return []
  const kind = boardOfApplication(app)
  const deciding = kind === null ? null : await boardForKind(db, kind, signal)
  return (await activeBoards(db)).filter((board) => board.id !== deciding?.id)
}

type BoardAssignInput = { applicationId: string; board: BoardRow; commentBy: CivilDate | null }

async function lockOpenApplication(
  tx: Tx,
  applicationId: string,
): Promise<Result<void, 'not_found' | 'application_closed'>> {
  const [app] = await tx
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for('update')
  if (app === undefined) return err('not_found')
  return isTerminalState(app.state) ? err('application_closed') : ok(undefined)
}

async function insertBoardAssignment(
  db: DbOrTx,
  actor: Actor,
  input: BoardAssignInput,
  signal: AbortSignal,
): Promise<Result<BoardAssigned, 'not_found' | 'application_closed'>> {
  return await transactionResult<BoardAssigned, 'not_found' | 'application_closed'>(
    db,
    async (tx) => {
      const open = await lockOpenApplication(tx, input.applicationId)
      if (!open.ok) return open
      const [created] = await tx
        .insert(reviewAssignments)
        .values({
          applicationId: input.applicationId,
          boardId: input.board.id,
          commentBy: input.commentBy,
          assignedBy: actor.userId,
        })
        .onConflictDoNothing()
        .returning({ id: reviewAssignments.id })
      if (created === undefined) {
        const [active] = await tx
          .select({ id: reviewAssignments.id })
          .from(reviewAssignments)
          .where(
            and(
              eq(reviewAssignments.applicationId, input.applicationId),
              eq(reviewAssignments.boardId, input.board.id),
              isNull(reviewAssignments.removedAt),
            ),
          )
        return ok({ assignmentId: active?.id ?? '', alreadyAssigned: true, notified: 0 })
      }
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'review.board_assign',
          entityType: 'application',
          entityId: input.applicationId,
          after: { boardId: input.board.id, assignmentId: created.id, commentBy: input.commentBy },
        },
        signal,
      )
      const notified = await queueSeatedMembers(tx, created.id, input, signal)
      return ok({ assignmentId: created.id, alreadyAssigned: false, notified })
    },
  )
}

async function queueSeatedMembers(
  tx: Tx,
  assignmentId: string,
  input: BoardAssignInput,
  signal: AbortSignal,
): Promise<number> {
  const [app] = await tx
    .select({ projectTitle: projects.title })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(applications.id, input.applicationId))
  const members = await boardMembersOf(tx, input.board.id)
  await queueNotification(
    tx,
    {
      event: 'board_comment_requested',
      applicationId: input.applicationId,
      recipientUserIds: members.map((m) => m.userId),
      discriminator: assignmentId,
      extra: {
        assignmentId,
        boardName: input.board.name,
        projectTitle: app?.projectTitle ?? '',
        ...(input.commentBy === null ? {} : { commentBy: input.commentBy }),
      },
    },
    signal,
  )
  return members.length
}

export async function assignBoardForComment(
  db: DbOrTx,
  actor: Actor,
  input: { applicationId: string; boardId: string; commentBy: CivilDate | null },
  signal: AbortSignal,
): Promise<Result<BoardAssigned, BoardAssignError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'review.assign', signal)
  if (!allowed.ok) return err('forbidden')
  const [app] = await db
    .select({ state: applications.state })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
  if (app === undefined) return err('not_found')
  if (isTerminalState(app.state)) return err('application_closed')
  const board = (await assignableBoards(db, input.applicationId, signal)).find(
    (b) => b.id === input.boardId,
  )
  if (board === undefined) return err('board_not_assignable')
  return await insertBoardAssignment(
    db,
    actor,
    { applicationId: input.applicationId, board, commentBy: input.commentBy },
    signal,
  )
}

export async function withdrawBoardAssignment(
  db: DbOrTx,
  actor: Actor,
  input: { assignmentId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found' | 'application_closed'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'review.assign', signal)
  if (!allowed.ok) return err('forbidden')
  const [target] = await db
    .select({ applicationId: reviewAssignments.applicationId })
    .from(reviewAssignments)
    .where(eq(reviewAssignments.id, input.assignmentId))
  if (target === undefined) return err('not_found')
  return await transactionResult<void, 'not_found' | 'application_closed'>(db, async (tx) => {
    const open = await lockOpenApplication(tx, target.applicationId)
    if (!open.ok) return open
    const [row] = await tx
      .update(reviewAssignments)
      .set({ removedAt: new Date() })
      .where(
        and(
          eq(reviewAssignments.id, input.assignmentId),
          isNull(reviewAssignments.removedAt),
          isNotNull(reviewAssignments.boardId),
        ),
      )
      .returning({
        applicationId: reviewAssignments.applicationId,
        boardId: reviewAssignments.boardId,
      })
    if (row === undefined) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'review.board_withdraw',
        entityType: 'application',
        entityId: row.applicationId,
        after: { boardId: row.boardId, assignmentId: input.assignmentId },
      },
      signal,
    )
    return ok(undefined)
  })
}
