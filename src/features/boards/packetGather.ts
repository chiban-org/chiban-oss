import type { Board } from '@packs/nh/schema'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { agendas, boardMeetings, boardPackets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import {
  type Candidate,
  type Exclusion,
  packetCandidates,
  TRC_SUMMARY_TITLE,
} from '@/features/boards/packetCandidates'
import { packetItemRows } from '@/features/boards/packetContents'
import { trcSummary } from '@/features/reviews/trcSummary'
import { formatCivilDate } from '@/lib/formatDate'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export type TrcState = 'make' | 'made' | 'none'

export interface GatherCandidate {
  documentId: string
  title: string
  checked: boolean
  exclusion: Exclusion | null
}

export interface GatherGroup {
  heading: string
  applicationId: string | null
  trc: TrcState | null
  candidates: GatherCandidate[]
}

export interface PacketGather {
  meetingId: string
  board: Board
  boardName: string
  title: string
  packetId: string | null
  groups: GatherGroup[]
}

export type GatherError = 'forbidden' | 'not_found' | 'meeting_cancelled' | 'agenda_not_published'

export type MeetingRow = typeof boardMeetings.$inferSelect
export type PacketRow = typeof boardPackets.$inferSelect

export interface PacketMeeting {
  meeting: MeetingRow
  agendaDocumentId: string | null
  packet: PacketRow | null
  boardName: string
  defaultTitle: string
}

export async function packetMeetingOf(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<PacketMeeting, GatherError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'packet.manage', signal))) return err('forbidden')
  if (!isUuid(meetingId)) return err('not_found')
  const [meeting] = await db.select().from(boardMeetings).where(eq(boardMeetings.id, meetingId))
  if (meeting === undefined) return err('not_found')
  if (meeting.status === 'cancelled') return err('meeting_cancelled')
  const [agenda] = await db.select().from(agendas).where(eq(agendas.meetingId, meetingId))
  if (agenda?.status !== 'published') return err('agenda_not_published')
  const [packet] = await db.select().from(boardPackets).where(eq(boardPackets.meetingId, meetingId))
  const boardName = boardLabel(await getBoardSettings(db, signal), meeting.board)
  return ok({
    meeting,
    agendaDocumentId: agenda.documentId,
    packet: packet ?? null,
    boardName,
    defaultTitle: `${boardName} packet, ${formatCivilDate(meeting.meetingDate)}`,
  })
}

async function trcStateOf(
  db: Db,
  actor: Actor,
  application: { id: string; hasSummary: boolean },
  signal: AbortSignal,
): Promise<TrcState> {
  if (application.hasSummary) return 'made'
  const applicationId = application.id
  const summary = await trcSummary(db, actor, applicationId, signal)
  return summary.ok && summary.value.length > 0 ? 'make' : 'none'
}

export async function gatherPacket(
  db: Db,
  actor: Actor,
  meetingId: string,
  signal: AbortSignal,
): Promise<Result<PacketGather, GatherError>> {
  const context = await packetMeetingOf(db, actor, meetingId, signal)
  if (!context.ok) return context
  const { meeting, packet } = context.value
  const { groups, candidates } = await packetCandidates(
    db,
    meeting,
    context.value.agendaDocumentId,
    signal,
  )
  const items = packet === null ? [] : await packetItemRows(db, packet.id)
  const active = items.filter((i) => i.removedAt === null)
  const inPacket = new Set(active.map((i) => i.documentId))
  const checked = (c: Candidate) =>
    c.exclusion === null && (packet === null || inPacket.has(c.documentId))
  const out: GatherGroup[] = []
  for (const group of groups) {
    out.push({
      heading: group.heading,
      applicationId: group.applicationId,
      trc:
        group.applicationId === null
          ? null
          : await trcStateOf(
              db,
              actor,
              {
                id: group.applicationId,
                hasSummary: candidates.some(
                  (c) => c.groupKey === group.key && c.title === TRC_SUMMARY_TITLE,
                ),
              },
              signal,
            ),
      candidates: candidates
        .filter((c) => c.groupKey === group.key)
        .map((c) => ({
          documentId: c.documentId,
          title: c.title,
          checked: checked(c),
          exclusion: c.exclusion,
        })),
    })
  }
  const listed = new Set(candidates.map((c) => c.documentId))
  const leftover = active.filter((i) => !listed.has(i.documentId))
  if (leftover.length > 0) {
    out.push({
      heading: 'No longer on the agenda',
      applicationId: null,
      trc: null,
      candidates: leftover.map((i) => ({
        documentId: i.documentId,
        title: i.title,
        checked: true,
        exclusion: null,
      })),
    })
  }
  return ok({
    meetingId,
    board: meeting.board,
    boardName: context.value.boardName,
    title: packet?.title ?? context.value.defaultTitle,
    packetId: packet?.id ?? null,
    groups: out,
  })
}
