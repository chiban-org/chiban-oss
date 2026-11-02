import { asc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMemberships, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { formatCivilDate } from '@/lib/formatDate'

export interface MembersView {
  rows: {
    membershipId: string
    name: string
    email: string
    boardName: string
    titleText: string
    termText: string
    active: boolean
  }[]
}

const TITLE_TEXT = {
  chair: 'Chair',
  vice_chair: 'Vice chair',
  member: 'Member',
  alternate: 'Alternate',
  clerk: 'Clerk',
} as const

export async function loadMembersView(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
  today: string,
): Promise<MembersView | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.manage_members', signal))) return null
  const settings = await getBoardSettings(db, signal)
  const rows = await db
    .select({ m: boardMemberships, name: users.displayName, email: users.email })
    .from(boardMemberships)
    .innerJoin(users, eq(users.id, boardMemberships.userId))
    .orderBy(asc(boardMemberships.board), asc(users.displayName))
  return {
    rows: rows.map(({ m, name, email }) => ({
      membershipId: m.id,
      name,
      email,
      boardName: boardLabel(settings, m.board),
      titleText: TITLE_TEXT[m.title],
      termText:
        m.termEnd === null
          ? `From ${formatCivilDate(m.termStart)}`
          : `${formatCivilDate(m.termStart)} to ${formatCivilDate(m.termEnd)}`,
      active: m.termStart <= today && (m.termEnd === null || m.termEnd >= today),
    })),
  }
}
