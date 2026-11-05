import { type SQL, type SQLWrapper, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { type CivilDate, daysBetween } from '@/types/civilDate'

export function unprovedHearingNotice(applicationId: SQLWrapper | string): SQL {
  return sql`from notice_items i
  join hearings h on h.notice_set_id = i.set_id and h.status = 'scheduled'
  where h.application_id = ${applicationId}
    and not exists (select 1 from notice_proofs p where p.item_id = i.id)`
}

export interface NoticeDeadline {
  hearingId: string
  meetingOn: CivilDate
  dueOn: CivilDate
  missing: number
  daysRemaining: number
}

export function isNoticeLate(deadline: NoticeDeadline): boolean {
  return deadline.daysRemaining < 0
}

export function lateNotice(deadlines: readonly NoticeDeadline[]): NoticeDeadline | null {
  return deadlines.find(isNoticeLate) ?? null
}

export async function loadNoticeDeadlines(
  db: DbOrTx,
  applicationId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<NoticeDeadline[]> {
  signal.throwIfAborted()
  const result = await db.execute<{
    hearing_id: string
    meeting_on: string
    due_on: string
    missing: number
  }>(sql`select h.id as hearing_id,
    (select m.meeting_date from board_meetings m where m.id = h.meeting_id)::text as meeting_on,
    min(i.due_on)::text as due_on, count(*)::int as missing
  ${unprovedHearingNotice(applicationId)}
  group by h.id
  order by min(i.due_on) asc, h.id asc`)
  return result.rows.map((r) => ({
    hearingId: r.hearing_id,
    meetingOn: r.meeting_on as CivilDate,
    dueOn: r.due_on as CivilDate,
    missing: r.missing,
    daysRemaining: daysBetween(today, r.due_on as CivilDate),
  }))
}
