import { and, count, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { preservationRecords } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

export async function countAwaitingFirstCopy(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<number, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const [row] = await db
    .select({ n: count() })
    .from(preservationRecords)
    .where(and(eq(preservationRecords.status, 'pending'), eq(preservationRecords.attempts, 0)))
  return ok(row?.n ?? 0)
}

export function awaitingFirstCopyText(n: number): string | null {
  if (n <= 0) return null
  return n === 1
    ? '1 document is waiting for its first archival copy.'
    : `${n} documents are waiting for their first archival copy.`
}
