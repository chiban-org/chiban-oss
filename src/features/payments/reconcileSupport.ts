import { and, eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { ledgerEntries, paymentAttempts } from '@/db/schema'
import type { LedgerActor, LedgerEntryType } from '@/features/ledger/types'

export interface ReconcileSource {
  kind: 'event' | 'reconcile' | 'staff' | 'reader'
  eventId?: string
  userId?: string
}

export function ledgerActorFor(source: ReconcileSource): LedgerActor {
  return source.userId === undefined
    ? { kind: 'system', job: `payments.${source.kind}` }
    : { kind: 'user', userId: source.userId }
}

export async function findProcessorEntry(
  tx: Tx,
  accountId: string,
  objectId: string,
  entryType: LedgerEntryType,
): Promise<string | null> {
  const [row] = await tx
    .select({ id: ledgerEntries.id })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.processorAccountId, accountId),
        eq(ledgerEntries.processorObjectId, objectId),
        eq(ledgerEntries.entryType, entryType),
      ),
    )
  return row?.id ?? null
}

export async function noteAnomaly(tx: Tx, attemptId: string, anomaly: string): Promise<void> {
  const [row] = await tx
    .select({ anomaly: paymentAttempts.anomaly })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.id, attemptId))
  if (row?.anomaly != null) return
  await tx.update(paymentAttempts).set({ anomaly }).where(eq(paymentAttempts.id, attemptId))
}
