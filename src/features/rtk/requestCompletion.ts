import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { auditLog, recordEvents } from '@/db/schema'
import { townTimeZone } from '@/features/town/timeZone'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/

function auditDateOf(after: unknown): CivilDate | null {
  if (typeof after !== 'object' || after === null || !('on' in after)) return null
  const on = after.on
  return typeof on === 'string' && CIVIL_DATE.test(on) ? (on as CivilDate) : null
}

export async function requestCompletedOn(
  db: Db,
  request: { id: string; status: string },
  signal: AbortSignal,
): Promise<CivilDate | null> {
  if (request.status !== 'closed' && request.status !== 'withdrawn') return null
  const [event] = await db
    .select({ occurredOn: recordEvents.occurredOn })
    .from(recordEvents)
    .where(
      and(eq(recordEvents.rtkRequestId, request.id), eq(recordEvents.kind, 'request_completed')),
    )
    .limit(1)
  if (event !== undefined) return event.occurredOn as CivilDate
  const [audit] = await db
    .select({ at: auditLog.at, after: auditLog.after })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'rtk_request'),
        eq(auditLog.entityId, request.id),
        eq(auditLog.action, `rtk.request_${request.status}`),
      ),
    )
    .orderBy(desc(auditLog.at))
    .limit(1)
  if (audit === undefined) return null
  return auditDateOf(audit.after) ?? todayInTimeZone(await townTimeZone(db, signal), audit.at)
}
