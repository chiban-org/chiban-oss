import type { DbOrTx } from '@/db/client'
import { workerState } from '@/db/schema'

export async function recordWorkerStart(db: DbOrTx, now: Date, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  await db
    .insert(workerState)
    .values({ id: 1, startedAt: now })
    .onConflictDoUpdate({ target: workerState.id, set: { startedAt: now } })
}
