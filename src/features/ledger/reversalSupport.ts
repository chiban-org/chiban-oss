import { eq } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import { type LedgerEntryRow, ledgerEntries } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import type { ProcessorFactoryDeps } from '@/features/payments/openProcessor'
import { err, ok, type Result } from '@/types/result'

export const MIN_REASON_LENGTH = 10

export interface ReversalDeps extends ProcessorFactoryDeps {
  now?: Date
}

export async function authorizeReversal(
  db: Db,
  actor: Actor,
  reason: string,
  signal: AbortSignal,
): Promise<Result<string, 'forbidden' | 'reason_required'>> {
  const allowed = await requireCapability(db, actor.userId, 'payment.refund_void_correct', signal)
  if (!allowed.ok) return err('forbidden')
  const trimmed = reason.trim()
  return trimmed.length < MIN_REASON_LENGTH ? err('reason_required') : ok(trimmed)
}

export async function loadEntry(db: DbOrTx, entryId: string): Promise<LedgerEntryRow | undefined> {
  const [row] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, entryId))
  return row
}
