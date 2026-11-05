import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { users } from '@/db/schema'

export interface AccountSummary {
  displayName: string
  email: string
  totpEnabled: boolean
  hasPassword: boolean
}

export async function loadAccountSummary(
  db: DbOrTx,
  userId: string,
  signal: AbortSignal,
): Promise<AccountSummary | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({
      displayName: users.displayName,
      email: users.email,
      totpEnabled: users.totpEnabled,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))
  if (row === undefined) return null
  const { passwordHash, ...rest } = row
  return { ...rest, hasPassword: passwordHash !== null }
}
