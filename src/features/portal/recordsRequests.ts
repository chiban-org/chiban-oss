import { desc, eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { rtkRequests, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { acknowledgementEnabled } from '@/features/packs/vocabulary'
import { requestCompletedOn } from '@/features/rtk/requestCompletion'
import { requesterEmailOf } from '@/features/rtk/requesterEmail'
import { requestStatusLabel } from '@/features/rtk/requestStatus'
import type { CivilDate } from '@/types/civilDate'

export interface PortalRecordsRequest {
  number: string
  receivedOn: CivilDate
  status: string
  due: { label: string; on: CivilDate } | null
  endedOn: CivilDate | null
}

type RequestRow = typeof rtkRequests.$inferSelect

function dueOf(row: RequestRow): PortalRecordsRequest['due'] {
  if (row.status === 'open') {
    const label = acknowledgementEnabled() ? 'Acknowledgement due' : 'Response due'
    return { label, on: row.responseDue.due }
  }
  if (row.status === 'awaiting_decision' && row.statedDue !== null) {
    return { label: 'Response due', on: row.statedDue.due }
  }
  return null
}

async function accountEmail(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
  return row?.email.toLowerCase() ?? null
}

export async function loadPortalRecordsRequests(
  db: Db,
  user: Actor,
  signal: AbortSignal,
): Promise<PortalRecordsRequest[]> {
  signal.throwIfAborted()
  const email = await accountEmail(db, user.userId)
  if (email === null) return []
  const candidates = await db
    .select()
    .from(rtkRequests)
    .where(sql`position(${email} in lower(coalesce(${rtkRequests.requesterContact}, ''))) > 0`)
    .orderBy(desc(rtkRequests.receivedOn), desc(rtkRequests.number))
  const mine = candidates.filter((r) => requesterEmailOf(r.requesterContact) === email)
  return await Promise.all(
    mine.map(async (r) => ({
      number: r.number,
      receivedOn: r.receivedOn as CivilDate,
      status: requestStatusLabel(r),
      due: dueOf(r),
      endedOn: await requestCompletedOn(db, r, signal),
    })),
  )
}
