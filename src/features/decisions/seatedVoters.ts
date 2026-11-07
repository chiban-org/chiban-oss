import { and, eq, gte, isNull, lte, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { boardMemberships, users } from '@/db/schema'
import type { CivilDate } from '@/types/civilDate'

function nameKey(name: string): string {
  return name.trim().replaceAll(/\s+/g, ' ').toLowerCase()
}

export async function seatedMemberNames(
  db: DbOrTx,
  boardId: string,
  onDate: CivilDate,
): Promise<string[]> {
  const rows = await db
    .select({ name: users.displayName })
    .from(boardMemberships)
    .innerJoin(users, eq(users.id, boardMemberships.userId))
    .where(
      and(
        eq(boardMemberships.boardId, boardId),
        lte(boardMemberships.termStart, onDate),
        or(isNull(boardMemberships.termEnd), gte(boardMemberships.termEnd, onDate)),
      ),
    )
    .orderBy(users.displayName)
  return [...new Set(rows.map((r) => r.name))]
}

export async function unseatedVoters(
  db: DbOrTx,
  boardId: string,
  onDate: CivilDate,
  voterNames: string[],
): Promise<string[]> {
  const seated = new Set((await seatedMemberNames(db, boardId, onDate)).map(nameKey))
  return voterNames.filter((name) => !seated.has(nameKey(name)))
}
