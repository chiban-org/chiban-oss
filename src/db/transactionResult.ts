import type { Db, DbOrTx, Tx } from '@/db/client'
import type { Result } from '@/types/result'

class RollbackSignal<E> extends Error {
  readonly failure: { ok: false; error: E }

  constructor(failure: { ok: false; error: E }) {
    super('rollback')
    this.failure = failure
  }
}

export async function transactionResult<T, E>(
  db: DbOrTx,
  fn: (tx: Tx) => Promise<Result<T, E>>,
): Promise<Result<T, E>> {
  try {
    return await (db as Db).transaction(async (tx) => {
      const result = await fn(tx)
      if (!result.ok) throw new RollbackSignal(result)
      return result
    })
  } catch (e) {
    if (e instanceof RollbackSignal) return e.failure
    throw e
  }
}
