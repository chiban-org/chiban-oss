import type { DbOrTx } from '@/db/client'
import type { agendaItems, boardMeetings } from '@/db/schema'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { formatMinuteOfDay } from '@/features/hearings/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { modelItems } from './agendaModel'
import type { AgendaModel } from './agendaPdf'

type ItemRow = typeof agendaItems.$inferSelect
type MeetingRow = typeof boardMeetings.$inferSelect

export async function agendaModelOf(
  db: DbOrTx,
  meeting: MeetingRow,
  items: ItemRow[],
  signal: AbortSignal,
): Promise<AgendaModel> {
  const settings = await getBoardSettings(db, signal)
  return {
    boardName: boardLabel(settings, meeting.board),
    meetingDate: formatCivilDate(meeting.meetingDate),
    location: meeting.location,
    time: formatMinuteOfDay(meeting.startsAtMinute),
    items: await modelItems(db, items, signal),
  }
}
