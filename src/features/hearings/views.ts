import type { Board } from '@packs/nh/schema'
import { asc, desc, eq } from 'drizzle-orm'
import type { ChecklistItem } from '@/components/notices/NoticeChecklist'
import type { Db } from '@/db/client'
import { appealNodes, boardDecisions, boardMeetings, documents, hearings } from '@/db/schema'
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

export function hearingText(
  kind: keyof typeof HEARING_KIND_LABELS,
  meetingDate: string,
  status: keyof typeof HEARING_STATUS_LABELS,
): string {
  return `${HEARING_KIND_LABELS[kind]}, ${formatCivilDate(meetingDate)}. ${HEARING_STATUS_LABELS[status]}.`
}

export interface ContinuationLink {
  hearingId: string
  dateText: string
}

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
  continuedFrom: ContinuationLink | null
  continuedTo: ContinuationLink | null
  announcedDetails: string | null
  noticeRequired: boolean
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

export async function timeZoneOf(db: Db, signal: AbortSignal): Promise<string> {
  const town = await getTownSettings(db, signal)
  return town.ok ? town.value.timeZone : 'America/New_York'
}

async function continuationOf(db: Db, hearingId: string | null): Promise<ContinuationLink | null> {
  if (hearingId === null) return null
  const [row] = await db
    .select({ id: hearings.id, date: boardMeetings.meetingDate })
    .from(hearings)
    .innerJoin(boardMeetings, eq(boardMeetings.id, hearings.meetingId))
    .where(eq(hearings.id, hearingId))
  return row === undefined ? null : { hearingId: row.id, dateText: formatCivilDate(row.date) }
}

async function continuedToOf(db: Db, hearingId: string): Promise<ContinuationLink | null> {
  const [row] = await db
    .select({ id: hearings.id })
    .from(hearings)
    .where(eq(hearings.continuedFrom, hearingId))
    .orderBy(asc(hearings.createdAt))
    .limit(1)
  return row === undefined ? null : await continuationOf(db, row.id)
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
    continuedFrom: await continuationOf(db, row.hearing.continuedFrom),
    continuedTo: await continuedToOf(db, hearingId),
    announcedDetails:
      row.hearing.continuationAnnounced === true ? (row.hearing.announcedDetails ?? '') : null,
    noticeRequired:
      row.hearing.continuedFrom !== null && row.hearing.continuationAnnounced !== true,
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
