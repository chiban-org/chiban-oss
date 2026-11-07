import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
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
import type { MailTransport } from '@/features/mail/transport'
import { boardCommentMail } from '@/features/reviews/boardCommentMail'
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
  emailed: number
  unsent: number
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

async function insertBoardAssignment(
  db: DbOrTx,
  actor: Actor,
  input: { applicationId: string; boardId: string; commentBy: CivilDate | null },
  signal: AbortSignal,
): Promise<Result<{ assignmentId: string; alreadyAssigned: boolean }, never>> {
  return await transactionResult<{ assignmentId: string; alreadyAssigned: boolean }, never>(
    db,
    async (tx) => {
      const [created] = await tx
        .insert(reviewAssignments)
        .values({
          applicationId: input.applicationId,
          boardId: input.boardId,
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
              eq(reviewAssignments.boardId, input.boardId),
              isNull(reviewAssignments.removedAt),
            ),
          )
        return ok({ assignmentId: active?.id ?? '', alreadyAssigned: true })
      }
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'review.board_assign',
          entityType: 'application',
          entityId: input.applicationId,
          after: { boardId: input.boardId, assignmentId: created.id, commentBy: input.commentBy },
        },
        signal,
      )
      return ok({ assignmentId: created.id, alreadyAssigned: false })
    },
  )
}

async function emailSeatedMembers(
  db: Db,
  mail: MailTransport,
  input: { applicationId: string; board: BoardRow; commentBy: CivilDate | null },
  signal: AbortSignal,
): Promise<{ emailed: number; unsent: number }> {
  const [app] = await db
    .select({ number: applications.number, projectTitle: projects.title })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(eq(applications.id, input.applicationId))
  const members = await boardMembersOf(db, input.board.id)
  let emailed = 0
  for (const member of members) {
    const message = boardCommentMail(member.email, {
      boardName: input.board.name,
      number: app?.number ?? '',
      projectTitle: app?.projectTitle ?? '',
      commentBy: input.commentBy,
    })
    if ((await mail.send(message, signal)).ok) emailed += 1
  }
  return { emailed, unsent: members.length - emailed }
}

export async function assignBoardForComment(
  db: Db,
  mail: MailTransport,
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
  const inserted = await insertBoardAssignment(db, actor, input, signal)
  if (!inserted.ok) return inserted
  if (inserted.value.alreadyAssigned) return ok({ ...inserted.value, emailed: 0, unsent: 0 })
  const sent = await emailSeatedMembers(
    db,
    mail,
    { applicationId: input.applicationId, board, commentBy: input.commentBy },
    signal,
  )
  return ok({ ...inserted.value, ...sent })
}

export async function withdrawBoardAssignment(
  db: DbOrTx,
  actor: Actor,
  input: { assignmentId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'review.assign', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
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
