import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { users } from '@/db/schema'

export interface ApplicantAccount {
  userId: string
  name: string
  email: string
}

export async function findApplicantAccount(
  db: DbOrTx,
  email: string,
  signal: AbortSignal,
): Promise<ApplicantAccount | null> {
  signal.throwIfAborted()
  const wanted = email.trim()
  if (wanted === '') return null
  const [row] = await db
    .select({ userId: users.id, name: users.displayName, email: users.email })
    .from(users)
    .where(and(eq(users.email, wanted), eq(users.isActive, true)))
    .limit(1)
  return row ?? null
}
