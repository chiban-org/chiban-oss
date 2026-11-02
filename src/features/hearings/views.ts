import type { Board } from '@packs/nh/schema'
import { asc, desc, eq } from 'drizzle-orm'
import type { ChecklistItem } from '@/components/notices/NoticeChecklist'
import type { Db } from '@/db/client'
import {
  agendaItems,
  agendas,
  appealNodes,
  boardDecisions,
  boardMeetings,
  documents,
  hearings,
} from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { boardLabel, getBoardSettings } from '@/features/boards/boardSettings'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { seatedMemberNames } from '@/features/decisions/seatedVoters'
import { evidenceOf } from '@/features/documents/evidence'
import { HEARING_KIND_LABELS } from '@/features/hearings/labels'
import { channelLabel } from '@/features/notices/channels'
import { noticeStatus } from '@/features/notices/noticeStatus'
import { proofMethodLabel } from '@/features/notices/proofMethods'
import { displayIdsFor } from '@/features/parcels/displayId'
import { getTownSettings } from '@/features/town/settings'
import { formatCivilDate } from '@/lib/formatDate'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

export const BOARD_NAMES: Record<Board, string> = {
  planning_board: 'Planning Board',
  zba: 'Zoning Board of Adjustment',
}

export const HEARING_STATUS_LABELS = {
  scheduled: 'Scheduled',
  held: 'Held',
  continued: 'Continued',
  cancelled: 'Cancelled',
} as const

export interface HearingView {
  hearingId: string
  applicationId: string
  applicationNumber: string
  typeLabel: string
  boardName: string
  meetingId: string
  meetingText: string
  kindText: string
  statusText: string
  status: keyof typeof HEARING_STATUS_LABELS
  continuationText: string | null
  checklist: ChecklistItem[]
  noticedOn: string | null
  properlyNoticed: boolean
  itemChoices: { id: string; label: string }[]
  documentChoices: { id: string; label: string }[]
  decision: { decisionId: string; text: string } | null
  otherMeetings: { id: string; text: string }[]
  noticeSetId: string
  defaultHeldOn: string
  defaultVotedOn: string
  seatedMembers: string[]
}

async function timeZoneOf(db: Db, signal: AbortSignal): Promise<string> {
  const town = await getTownSettings(db, signal)
  return town.ok ? town.value.timeZone : 'America/New_York'
}

export async function loadHearingView(
  db: Db,
  actor: Actor,
  hearingId: string,
  signal: AbortSignal,
): Promise<HearingView | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return null
  const [row] = await db
    .select({ hearing: hearings, meeting: boardMeetings })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .where(eq(hearings.id, hearingId))
  if (row === undefined) return null
  const app = await loadApplicationContext(db, row.hearing.applicationId, signal)
  if (app === null) return null
  const status = await noticeStatus(db, row.hearing.noticeSetId, signal)
  const settings = await getBoardSettings(db, signal)
  const zone = await timeZoneOf(db, signal)
  const [decision] = await db
    .select()
    .from(boardDecisions)
    .where(eq(boardDecisions.hearingId, hearingId))
  const docs = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(evidenceOf(row.hearing.applicationId))
    .orderBy(desc(documents.seq))
  const upcoming = await db
    .select()
    .from(boardMeetings)
    .where(eq(boardMeetings.board, row.meeting.board))
    .orderBy(asc(boardMeetings.meetingDate))
  const checklist: ChecklistItem[] = status.items.map((i) => ({
    itemId: i.itemId,
    channel: channelLabel(i.channel),
    recipientName: i.recipientName,
    recipientAddress: i.recipientAddress,
    dueOn: formatCivilDate(i.dueOn),
    proof:
      i.proof === null
        ? null
        : {
            method: proofMethodLabel(i.proof.method),
            reference: i.proof.reference,
            effectiveOn: formatCivilDate(i.proof.effectiveOn),
          },
    state: i.state,
  }))
  return {
    hearingId,
    applicationId: app.id,
    applicationNumber: app.number,
    typeLabel: app.typeBody.label,
    boardName: boardLabel(settings, row.meeting.board),
    meetingId: row.meeting.id,
    meetingText: formatCivilDate(row.meeting.meetingDate),
    kindText: HEARING_KIND_LABELS[row.hearing.kind],
    statusText: HEARING_STATUS_LABELS[row.hearing.status],
    status: row.hearing.status,
    continuationText:
      row.hearing.continuedFrom === null
        ? null
        : row.hearing.continuationAnnounced === true
          ? `Continued from an earlier hearing. Announced at the meeting: ${row.hearing.announcedDetails ?? ''}`
          : 'Continued from an earlier hearing without an announcement, so new notice is required.',
    checklist,
    noticedOn:
      row.hearing.properlyNoticedAt === null
        ? null
        : formatCivilDate(todayInTimeZone(zone, row.hearing.properlyNoticedAt)),
    properlyNoticed: status.properlyNoticed,
    itemChoices: checklist.map((i) => ({
      id: i.itemId,
      label: `${i.channel}${i.recipientName === null ? '' : `, ${i.recipientName}`}`,
    })),
    documentChoices: docs.map((d) => ({ id: d.id, label: d.title })),
    decision:
      decision === undefined
        ? null
        : {
            decisionId: decision.id,
            text: `${OUTCOME_LABELS[decision.outcome]}, voted ${formatCivilDate(decision.votedOn)}`,
          },
    otherMeetings: upcoming
      .filter((m) => m.status === 'scheduled' && m.meetingDate > row.meeting.meetingDate)
      .map((m) => ({ id: m.id, text: formatCivilDate(m.meetingDate) })),
    noticeSetId: row.hearing.noticeSetId,
    defaultHeldOn: row.meeting.meetingDate,
    defaultVotedOn: row.hearing.heldOn ?? row.meeting.meetingDate,
    seatedMembers: await seatedMemberNames(
      db,
      row.meeting.board,
      (row.hearing.heldOn ?? row.meeting.meetingDate) as CivilDate,
    ),
  }
}

export interface MeetingView {
  meetingId: string
  board: Board
  boardName: string
  dateText: string
  locationText: string
  hearings: { id: string; text: string; statusText: string }[]
  agenda: {
    status: 'draft' | 'published'
    revision: number
    statusText: string
    items: {
      id: string
      position: number
      text: string
      line: string
      description: string
      kindText: string
    }[]
    documentId: string | null
  } | null
}

const AGENDA_KIND_LABELS = {
  hearing: 'Hearing',
  business: 'Business',
  minutes_approval: 'Minutes',
  other: 'Other',
} as const

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
    })
  }
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
    dateText: formatCivilDate(meeting.meetingDate),
    locationText: meeting.location,
    hearings: lines,
    agenda:
      agenda === undefined
        ? null
        : {
            status: agenda.status,
            revision: agenda.revision,
            statusText:
              agenda.status === 'published' && agenda.publishedAt !== null
                ? `Published on the public site on ${formatCivilDate(todayInTimeZone(await timeZoneOf(db, signal), agenda.publishedAt))}. Revision ${agenda.revision}.`
                : 'Draft. Not yet public.',
            documentId: agenda.documentId,
            items: items.map((i) => ({
              id: i.id,
              position: i.position,
              text: i.title,
              line: i.kind === 'hearing' ? i.title : `${AGENDA_KIND_LABELS[i.kind]}: ${i.title}`,
              description: i.description,
              kindText: AGENDA_KIND_LABELS[i.kind],
            })),
          },
  }
}

export async function loadApplicationAppealNodes(db: Db, applicationId: string) {
  return await db
    .select()
    .from(appealNodes)
    .where(eq(appealNodes.applicationId, applicationId))
    .orderBy(asc(appealNodes.occurredOn), asc(appealNodes.createdAt))
}

export async function parcelDisplayFor(db: Db, parcelId: string): Promise<string> {
  return (await displayIdsFor(db, [parcelId])).get(parcelId) ?? ''
}
