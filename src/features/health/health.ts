import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'

export async function healthResponse(db: DbOrTx, signal: AbortSignal): Promise<Response> {
  try {
    signal.throwIfAborted()
    await db.execute(sql`select 1`)
    return Response.json({ status: 'ok' })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return Response.json({ status: 'unavailable' }, { status: 503 })
  }
}
