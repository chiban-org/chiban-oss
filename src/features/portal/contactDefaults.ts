import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { accountProfiles, users } from '@/db/schema'

export async function contactDefaults(
  db: DbOrTx,
  userId: string,
  signal: AbortSignal,
): Promise<{ name: string; phone: string }> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ name: users.displayName, phone: accountProfiles.phone })
    .from(users)
    .leftJoin(accountProfiles, eq(accountProfiles.userId, users.id))
    .where(eq(users.id, userId))
  return { name: row?.name ?? '', phone: row?.phone ?? '' }
}
