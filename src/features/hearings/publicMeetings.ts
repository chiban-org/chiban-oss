import { sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documentVisibleTo } from '@/features/documents/visibility'
import type { CivilDate } from '@/types/civilDate'

export interface PublicPage {
  page: number
  hasNext: boolean
}

export interface PublicUpcomingMeeting {
  meetingId: string
  boardShortName: string
  meetingDate: CivilDate
  startsAtMinute: number
  location: string
  cancelled: boolean
  agendaDocumentId: string | null
}

export interface PublicPastMeeting {
  meetingId: string
  boardShortName: string
  meetingDate: CivilDate
  agendaDocumentId: string | null
  minutes: { documentId: string; approvedOn: CivilDate | null } | null
}

export const UPCOMING_LIMIT = 25
export const PAST_PAGE_SIZE = 20

const PUBLIC_AGENDA = sql`(select a.document_id from agendas a
  join documents ad on ad.id = a.document_id
  where a.meeting_id = m.id and a.status = 'published' and ad.is_public)`

interface UpcomingRow extends Record<string, unknown> {
  meeting_id: string
  short_name: string
  meeting_date: string
  starts_at_minute: number
  location: string
  status: 'scheduled' | 'cancelled'
  agenda_document_id: string | null
}

export async function loadUpcomingMeetings(
  db: DbOrTx,
  today: CivilDate,
  signal: AbortSignal,
): Promise<PublicUpcomingMeeting[]> {
  signal.throwIfAborted()
  const res = await db.execute<UpcomingRow>(sql`
    select m.id as meeting_id, b.short_name, m.meeting_date, m.starts_at_minute, m.location,
      m.status, ${PUBLIC_AGENDA} as agenda_document_id
    from board_meetings m join boards b on b.id = m.board_id
    where m.meeting_date >= ${today}
    order by m.meeting_date, m.starts_at_minute, m.id
    limit ${UPCOMING_LIMIT}`)
  return res.rows.map((r) => ({
    meetingId: r.meeting_id,
    boardShortName: r.short_name,
    meetingDate: r.meeting_date as CivilDate,
    startsAtMinute: r.starts_at_minute,
    location: r.location,
    cancelled: r.status === 'cancelled',
    agendaDocumentId: r.agenda_document_id,
  }))
}

interface PastRow extends Record<string, unknown> {
  meeting_id: string
  short_name: string
  meeting_date: string
  agenda_document_id: string | null
  minutes_document_id: string | null
  approved_on: string | null
}

export async function loadPastMeetings(
  db: DbOrTx,
  options: { today: CivilDate; page: number },
  signal: AbortSignal,
): Promise<{ meetings: PublicPastMeeting[]; page: PublicPage }> {
  signal.throwIfAborted()
  const page = Math.max(1, Math.floor(options.page))
  const res = await db.execute<PastRow>(sql`
    select * from (
      select m.id as meeting_id, b.short_name, m.meeting_date,
        ${PUBLIC_AGENDA} as agenda_document_id,
        mm.document_id as minutes_document_id, mm.approved_on
      from board_meetings m
      join boards b on b.id = m.board_id
      left join meeting_minutes mm on mm.meeting_id = m.id and mm.status = 'approved'
        and exists (select 1 from documents where documents.id = mm.document_id
          and ${documentVisibleTo(null)})
    ) t
    where t.minutes_document_id is not null
      or (t.meeting_date < ${options.today} and t.agenda_document_id is not null)
    order by t.meeting_date desc, t.meeting_id desc
    limit ${PAST_PAGE_SIZE + 1} offset ${(page - 1) * PAST_PAGE_SIZE}`)
  const rows = res.rows.slice(0, PAST_PAGE_SIZE)
  return {
    meetings: rows.map((r) => ({
      meetingId: r.meeting_id,
      boardShortName: r.short_name,
      meetingDate: r.meeting_date as CivilDate,
      agendaDocumentId: r.agenda_document_id,
      minutes:
        r.minutes_document_id === null
          ? null
          : { documentId: r.minutes_document_id, approvedOn: r.approved_on as CivilDate | null },
    })),
    page: { page, hasNext: res.rows.length > PAST_PAGE_SIZE },
  }
}
