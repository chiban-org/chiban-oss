import { sql } from 'drizzle-orm'
import type { Db, DbOrTx, Tx } from '@/db/client'

export async function withFileLock<T>(
  db: DbOrTx,
  sha256: string,
  signal: AbortSignal,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted()
  return await (db as Db).transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('file:' || ${sha256}))`)
    return await fn(tx)
  })
}
