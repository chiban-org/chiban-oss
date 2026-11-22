import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { auditLog, rtkRequests, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requesterEmailOf } from '@/features/rtk/requesterEmail'
import { isAcknowledgedOnly, isRequestOpen, requestStatusLabel } from '@/features/rtk/requestStatus'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

export interface PortalRecordsRequest {
  number: string
  receivedOn: CivilDate
  status: string
  responseDueOn: CivilDate | null
  endedOn: CivilDate | null
}

const ENDED_ACTIONS = ['rtk.request_closed', 'rtk.request_withdrawn']
const AWAITING_STATUSES: readonly string[] = ['open', 'awaiting_decision']

function awaitingResponse(row: { status: string; firstResponseKind: string | null }): boolean {
  return AWAITING_STATUSES.includes(row.status) || isAcknowledgedOnly(row)
}

function filedOnlineBy(userId: string) {
  return and(eq(rtkRequests.createdBy, userId), eq(rtkRequests.receivedVia, 'portal'))
}

async function accountEmail(db: DbOrTx, userId: string): Promise<string | null> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
  return row?.email.toLowerCase() ?? null
}

async function endedDates(
  db: DbOrTx,
  ids: string[],
  signal: AbortSignal,
): Promise<Map<string, CivilDate>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select({ id: auditLog.entityId, at: auditLog.at })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'rtk_request'),
        inArray(auditLog.entityId, ids),
        inArray(auditLog.action, ENDED_ACTIONS),
      ),
    )
    .orderBy(desc(auditLog.at))
  const town = await getTownSettings(db, signal)
  const zone = town.ok ? town.value.timeZone : 'UTC'
  const ended = new Map<string, CivilDate>()
  for (const row of rows) {
    if (!ended.has(row.id)) ended.set(row.id, todayInTimeZone(zone, row.at))
  }
  return ended
}

export async function loadPortalRecordsRequests(
  db: DbOrTx,
  user: Actor,
  signal: AbortSignal,
): Promise<PortalRecordsRequest[]> {
  signal.throwIfAborted()
  const email = await accountEmail(db, user.userId)
  const contactHas =
    email === null
      ? undefined
      : sql`position(${email} in lower(coalesce(${rtkRequests.requesterContact}, ''))) > 0`
  const candidates = await db
    .select()
    .from(rtkRequests)
    .where(or(filedOnlineBy(user.userId), contactHas))
    .orderBy(desc(rtkRequests.receivedOn), desc(rtkRequests.number))
  const mine = candidates.filter(
    (r) =>
      (r.createdBy === user.userId && r.receivedVia === 'portal') ||
      requesterEmailOf(r.requesterContact) === email,
  )
  const ended = await endedDates(
    db,
    mine.map((r) => r.id),
    signal,
  )
  return mine.map((r) => {
    const open = isRequestOpen(r)
    return {
      number: r.number,
      receivedOn: r.receivedOn as CivilDate,
      status: requestStatusLabel(r),
      responseDueOn: awaitingResponse(r) ? (r.statedDue ?? r.responseDue).due : null,
      endedOn: open ? null : (ended.get(r.id) ?? null),
    }
  })
}
