import { desc, eq, exists } from 'drizzle-orm'
import { agendaItems, boardMeetings, boardPackets } from '@/db/schema'
import { agendaModelOf } from '@/features/agendas/agendaMeetingModel'
import { agendaDocumentInput } from '@/features/agendas/agendaPdf'
import { packetCoverInput } from '@/features/boards/cover'
import { loadPacketView } from '@/features/boards/packetView'
import { allBoards, boardLabel } from '@/features/boards/townBoards'
import { documentFrame } from '@/features/pdf/documentFrame'
import { type PreviewSource, SAMPLE_LIMIT } from '@/features/templates/preview/previewTypes'
import { formatCivilDate } from '@/lib/formatDate'

export const AGENDA_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const boardRows = await allBoards(db)
    const rows = await db
      .select({
        id: boardMeetings.id,
        boardId: boardMeetings.boardId,
        date: boardMeetings.meetingDate,
      })
      .from(boardMeetings)
      .where(
        exists(
          db
            .select({ id: agendaItems.id })
            .from(agendaItems)
            .where(eq(agendaItems.meetingId, boardMeetings.id)),
        ),
      )
      .orderBy(desc(boardMeetings.meetingDate))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({
      id: r.id,
      label: `${boardLabel(boardRows.find((b) => b.id === r.boardId) ?? { name: '' })}, ${formatCivilDate(r.date)}`,
    }))
  },
  async input({ db, signal }, id) {
    const [meeting] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, id))
    if (meeting === undefined) return null
    const items = await db
      .select()
      .from(agendaItems)
      .where(eq(agendaItems.meetingId, id))
      .orderBy(agendaItems.position, agendaItems.id)
    if (items.length === 0) return null
    const frame = await documentFrame(db, { boardId: meeting.boardId }, signal)
    return agendaDocumentInput(frame, await agendaModelOf(db, meeting, items, signal))
  },
}

export const BOARD_PACKET_COVER_SOURCE: PreviewSource = {
  async samples({ db, signal }) {
    signal.throwIfAborted()
    const rows = await db
      .select({ id: boardPackets.id, title: boardPackets.title, date: boardPackets.meetingDate })
      .from(boardPackets)
      .orderBy(desc(boardPackets.createdAt))
      .limit(SAMPLE_LIMIT)
    return rows.map((r) => ({ id: r.id, label: `${r.title}, meeting ${formatCivilDate(r.date)}` }))
  },
  async input({ db, signal }, id) {
    const view = await loadPacketView(db, id, '', signal)
    if (view === null) return null
    return packetCoverInput(view, await documentFrame(db, { boardId: view.boardId }, signal))
  },
}
