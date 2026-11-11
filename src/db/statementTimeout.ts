import { sql } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'

export async function withStatementTimeout<T>(
  db: DbOrTx,
  timeoutMs: number,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const ms = Math.max(1, Math.trunc(timeoutMs))
  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('statement_timeout', ${`${ms}ms`}, true)`)
    return await fn(tx)
  })
}
