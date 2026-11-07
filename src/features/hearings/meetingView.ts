import type { Board } from '@packs/nh/schema'
import { asc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { agendaItems, agendas, boardMeetings, hearings } from '@/db/schema'
import { meetingPacketId } from '@/features/agendas/meetingPacket'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { HEARING_STATUS_LABELS, timeZoneOf } from '@/features/hearings/views'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'
import { todayInTimeZone } from '@/types/civilDate'

type AgendaRow = typeof agendas.$inferSelect
type AgendaItemRow = typeof agendaItems.$inferSelect

export interface MeetingAgendaView {
  status: 'draft' | 'published'
  revision: number
  publishedText: string | null
  items: {
    id: string
    position: number
    text: string
    line: string
    description: string
    kindText: string
  }[]
  documentId: string | null
}

export interface MeetingView {
  meetingId: string
  board: Board
  boardName: string
  meetingDate: string
  dateText: string
  kindText: string
  locationText: string
  cancelled: boolean
  past: boolean
  cancelReason: string | null
  hearings: {
    id: string
    text: string
    statusText: string
    status: keyof typeof HEARING_STATUS_LABELS
  }[]
  agenda: MeetingAgendaView | null
  packetId: string | null
  canManagePackets: boolean
}

const AGENDA_KIND_LABELS = {
  hearing: 'Hearing',
  business: 'Business',
  minutes_approval: 'Minutes',
  other: 'Other',
} as const

async function hearingLines(
  db: Db,
  meetingId: string,
  signal: AbortSignal,
): Promise<MeetingView['hearings']> {
  const rows = await db
    .select()
    .from(hearings)
    .where(eq(hearings.meetingId, meetingId))
    .orderBy(asc(hearings.createdAt))
  const lines: MeetingView['hearings'] = []
  for (const h of rows) {
    const app = await loadApplicationContext(db, h.applicationId, signal)
    lines.push({
      id: h.id,
      text: `${HEARING_KIND_LABELS[h.kind]}: ${app?.typeBody.label ?? 'Application'} ${app?.number ?? ''}`.trim(),
      statusText: HEARING_STATUS_LABELS[h.status],
      status: h.status,
    })
  }
  return lines
}

async function agendaView(
  db: Db,
  agenda: AgendaRow,
  items: AgendaItemRow[],
  signal: AbortSignal,
): Promise<MeetingAgendaView> {
  return {
    status: agenda.status,
    revision: agenda.revision,
    publishedText:
      agenda.status === 'published' && agenda.publishedAt !== null
        ? formatCivilDate(todayInTimeZone(await timeZoneOf(db, signal), agenda.publishedAt))
        : null,
    documentId: agenda.documentId,
    items: items.map((i) => ({
      id: i.id,
      position: i.position,
      text: i.title,
      line: i.kind === 'hearing' ? i.title : `${AGENDA_KIND_LABELS[i.kind]}: ${i.title}`,
      description: i.description,
      kindText: AGENDA_KIND_LABELS[i.kind],
    })),
  }
}

export function agendaStatusText(agenda: MeetingAgendaView): string {
  return agenda.publishedText === null
    ? 'Draft. Not yet public.'
    : `Shown on the public site on ${agenda.publishedText}. Revision ${agenda.revision}.`
}

export async function loadMeetingView(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<MeetingView | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return null
  const [meeting] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId))
  if (meeting === undefined) return null
  const settings = await getBoardSettings(db, signal)
  const [agenda] = await db.select().from(agendas).where(eq(agendas.meetingId, meetingId))
  const items =
    agenda === undefined
      ? []
      : await db
          .select()
          .from(agendaItems)
          .where(eq(agendaItems.meetingId, meetingId))
          .orderBy(asc(agendaItems.position))
  return {
    meetingId,
    board: meeting.board,
    boardName: boardLabel(settings, meeting.board),
    meetingDate: meeting.meetingDate,
    dateText: formatCivilDate(meeting.meetingDate),
    kindText: meeting.kind === 'special' ? 'Special meeting' : 'Regular meeting',
    locationText: meeting.location,
    cancelled: meeting.status === 'cancelled',
    past: meeting.meetingDate < (await townToday(db, new Date(), signal)),
    cancelReason: meeting.cancelReason,
    hearings: await hearingLines(db, meetingId, signal),
    agenda: agenda === undefined ? null : await agendaView(db, agenda, items, signal),
    packetId: await meetingPacketId(db, meetingId),
    canManagePackets: await hasCapability(db, actor.userId, 'packet.manage', signal),
  }
}
