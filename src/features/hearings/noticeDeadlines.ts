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
  met: boolean
  daysRemaining: number
}

export function isNoticeLate(deadline: NoticeDeadline): boolean {
  return !deadline.met && deadline.daysRemaining < 0
}

export function lateNotice(deadlines: readonly NoticeDeadline[]): NoticeDeadline | null {
  return deadlines.find(isNoticeLate) ?? null
}

type DeadlineRow = {
  hearing_id: string
  meeting_on: string
  due_on: string
  missing: number
}

function provedHearingNotice(applicationId: string): SQL {
  return sql`select h.id as hearing_id, m.meeting_date::text as meeting_on,
    min(i.due_on)::text as due_on, 0 as missing
  from hearings h
  join board_meetings m on m.id = h.meeting_id
  join notice_items i on i.set_id = h.notice_set_id
  where h.application_id = ${applicationId}
    and (h.status = 'held' or (h.status = 'scheduled' and h.properly_noticed_at is not null))
    and not exists (
      select 1 from notice_items u
      where u.set_id = h.notice_set_id
        and not exists (select 1 from notice_proofs p where p.item_id = u.id)
    )
  group by h.id, m.meeting_date`
}

export async function loadNoticeDeadlines(
  db: DbOrTx,
  applicationId: string,
  today: CivilDate,
  signal: AbortSignal,
): Promise<NoticeDeadline[]> {
  signal.throwIfAborted()
  const unproved = await db.execute<DeadlineRow>(sql`select h.id as hearing_id,
    (select m.meeting_date from board_meetings m where m.id = h.meeting_id)::text as meeting_on,
    min(i.due_on)::text as due_on, count(*)::int as missing
  ${unprovedHearingNotice(applicationId)}
  group by h.id`)
  const proved = await db.execute<DeadlineRow>(provedHearingNotice(applicationId))
  const rows = [
    ...unproved.rows.map((r) => ({ ...r, met: false })),
    ...proved.rows.map((r) => ({ ...r, met: true })),
  ].sort((a, b) => a.due_on.localeCompare(b.due_on) || a.hearing_id.localeCompare(b.hearing_id))
  return rows.map((r) => ({
    hearingId: r.hearing_id,
    meetingOn: r.meeting_on as CivilDate,
    dueOn: r.due_on as CivilDate,
    missing: r.met ? 0 : r.missing,
    met: r.met,
    daysRemaining: daysBetween(today, r.due_on as CivilDate),
  }))
}
