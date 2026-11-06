import { desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { boardMeetings, documents, meetingMinutes } from '@/db/schema'
import { type MinutesStatus, minutesDocumentsOf } from '@/features/boards/minutes'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'

export interface MeetingMinutesView {
  held: boolean
  today: string
  current: {
    documentId: string
    title: string
    status: MinutesStatus
    approvedText: string | null
  } | null
  choices: { id: string; label: string }[]
}

export async function loadMeetingMinutes(
  db: Db,
  meetingId: string,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<MeetingMinutesView> {
  signal.throwIfAborted()
  const [meeting] = await db
    .select({ meetingDate: boardMeetings.meetingDate })
    .from(boardMeetings)
    .where(eq(boardMeetings.id, meetingId))
  const [row] = await db
    .select({ minutes: meetingMinutes, title: documents.title })
    .from(meetingMinutes)
    .innerJoin(documents, eq(documents.id, meetingMinutes.documentId))
    .where(eq(meetingMinutes.meetingId, meetingId))
  const choices = await db
    .select({ id: documents.id, label: documents.title })
    .from(documents)
    .where(minutesDocumentsOf(meetingId))
    .orderBy(desc(documents.seq))
  const today = await townToday(db, now, signal)
  return {
    held: meeting !== undefined && meeting.meetingDate <= today,
    today,
    current:
      row === undefined
        ? null
        : {
            documentId: row.minutes.documentId,
            title: row.title,
            status: row.minutes.status,
            approvedText:
              row.minutes.approvedOn === null ? null : formatCivilDate(row.minutes.approvedOn),
          },
    choices,
  }
}

export function currentMinutesText(current: NonNullable<MeetingMinutesView['current']>): string {
  return current.approvedText === null
    ? 'Draft. Not public.'
    : `Approved ${current.approvedText}. Public.`
}

export function minutesStatusText(view: MeetingMinutesView): string | null {
  if (view.current === null) return view.held ? 'Not attached yet' : null
  return currentMinutesText(view.current)
}
