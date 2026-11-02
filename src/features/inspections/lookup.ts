import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import type { Actor } from '@/features/auth/actor'

export async function findIssuedApplicationByNumber(
  db: DbOrTx,
  actor: Actor,
  number: string,
  signal: AbortSignal,
): Promise<{ id: string; number: string; state: string } | null> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ id: applications.id, number: applications.number, state: applications.state })
    .from(applications)
    .where(and(eq(applications.number, number.trim()), applicationVisibleTo(actor)))
  return row ?? null
}
