import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { healthAlerts } from '@/db/schema'

export async function jobsHealthResponse(db: DbOrTx, signal: AbortSignal): Promise<Response> {
  try {
    signal.throwIfAborted()
    const firing = await db
      .select({ key: healthAlerts.key, kind: healthAlerts.kind })
      .from(healthAlerts)
      .where(eq(healthAlerts.state, 'firing'))
      .orderBy(healthAlerts.key)
    if (firing.length === 0) return Response.json({ status: 'ok' })
    return Response.json({ status: 'alerting', alerts: firing }, { status: 503 })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return Response.json({ status: 'unavailable' }, { status: 503 })
  }
}
