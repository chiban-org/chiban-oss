import type { DbOrTx } from '@/db/client'
import type { agendaItems, boardMeetings } from '@/db/schema'
import { boardChairName, getBoard } from '@/features/boards/townBoards'
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
  signal.throwIfAborted()
  const board = await getBoard(db, meeting.boardId)
  return {
    boardName: board?.name ?? '',
    boardShortName: board?.shortName ?? '',
    boardChairName: board === null ? '' : await boardChairName(db, board.id),
    meetingDate: formatCivilDate(meeting.meetingDate),
    location: meeting.location,
    time: formatMinuteOfDay(meeting.startsAtMinute),
    items: await modelItems(db, items, signal),
  }
}
