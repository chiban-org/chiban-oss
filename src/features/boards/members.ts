import { and, eq } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db } from '@/db/client'
import { boardMemberships, userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardLabel, getBoard } from '@/features/boards/townBoards'
import type { MailTransport } from '@/features/mail/transport'
import { publishedWording } from '@/features/notifications/messageSettings'
import { boardMemberValues, wordingLink } from '@/features/notifications/wording/externalValues'
import { renderWording } from '@/features/notifications/wording/renderWording'
import { wordingFor } from '@/features/notifications/wording/wordingEdits'
import { townToday } from '@/features/town/today'
import { addDays, type CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type MemberTitle = 'chair' | 'vice_chair' | 'member' | 'alternate' | 'clerk'

export const MEMBER_TITLE_LABELS: Record<MemberTitle, string> = {
  chair: 'Chair',
  vice_chair: 'Vice chair',
  member: 'Member',
  alternate: 'Alternate',
  clerk: 'Clerk',
}

export type InviteError =
  | 'forbidden'
  | 'staff_account'
  | 'send_failed'
  | 'term_order'
  | 'unknown_board'

interface InviteInput {
  email: string
  displayName: string
  boardId: string
  title: MemberTitle
  termStart: CivilDate
  termEnd?: CivilDate
}

export async function inviteBoardMember(
  db: Db,
  mail: MailTransport,
  actor: Actor,
  input: InviteInput,
  signal: AbortSignal,
): Promise<Result<{ userId: string; membershipId: string }, InviteError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.manage_members', signal))) {
    return err('forbidden')
  }
  if (input.termEnd !== undefined && input.termEnd < input.termStart) return err('term_order')
  const board = await getBoard(db, input.boardId)
  if (board === null || board.archivedAt !== null) return err('unknown_board')
  const email = input.email.trim().toLowerCase()
  const created = await transactionResult<{ userId: string; membershipId: string }, InviteError>(
    db,
    async (tx) => {
      const [existing] = await tx.select().from(users).where(eq(users.email, email))
      if (existing?.kind === 'staff') return err('staff_account')
      const userId =
        existing?.id ??
        (
          await tx
            .insert(users)
            .values({ email, displayName: input.displayName, kind: 'public' })
            .returning({ id: users.id })
        )[0]?.id ??
        ''
      const [hasRole] = await tx
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.role, 'board_member')))
      if (hasRole === undefined) await tx.insert(userRoles).values({ userId, role: 'board_member' })
      const [membership] = await tx
        .insert(boardMemberships)
        .values({
          userId,
          boardId: input.boardId,
          title: input.title,
          termStart: input.termStart,
          termEnd: input.termEnd ?? null,
          createdBy: actor.userId,
        })
        .returning({ id: boardMemberships.id })
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'board.member.invite',
          entityType: 'user',
          entityId: userId,
          after: { boardId: input.boardId, title: input.title, termStart: input.termStart },
        },
        signal,
      )
      return ok({ userId, membershipId: membership?.id ?? '' })
    },
  )
  if (!created.ok) return created
  const overrides = await publishedWording(db, signal)
  const message = renderWording(
    wordingFor('board_member_added', overrides),
    boardMemberValues({
      boardName: boardLabel(board),
      titleLabel: MEMBER_TITLE_LABELS[input.title],
    }),
    wordingLink('board_member_added', `${env.BASE_URL}/board`),
  )
  const sent = await mail.send({ to: email, ...message }, signal)
  return sent.ok ? created : err('send_failed')
}

export async function endMembership(
  db: Db,
  actor: Actor,
  membershipId: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<void, 'forbidden' | 'not_found' | 'already_ended' | 'not_started'>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.manage_members', signal))) {
    return err('forbidden')
  }
  const today = await townToday(db, now, signal)
  const yesterday = addDays(today, -1)
  const [current] = await db
    .select({ termStart: boardMemberships.termStart, termEnd: boardMemberships.termEnd })
    .from(boardMemberships)
    .where(eq(boardMemberships.id, membershipId))
  if (current === undefined) return err('not_found')
  if (current.termEnd !== null && current.termEnd < today) return err('already_ended')
  if (current.termStart > today) return err('not_started')
  const ended = await db
    .update(boardMemberships)
    .set({ termEnd: yesterday })
    .where(eq(boardMemberships.id, membershipId))
    .returning({ userId: boardMemberships.userId })
  if (ended[0] === undefined) return err('not_found')
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'board.member.end',
      entityType: 'user',
      entityId: ended[0].userId,
      after: { membershipId, termEnd: yesterday },
    },
    signal,
  )
  return ok(undefined)
}
