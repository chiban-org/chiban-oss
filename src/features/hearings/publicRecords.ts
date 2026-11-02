import { and, desc, eq, isNotNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { agendas, applications, boardDecisions, boardMeetings, documents } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { BOARD_NAMES } from '@/features/hearings/views'
import { formatCivilDate } from '@/lib/formatDate'

export interface PublicAgendaLine {
  meetingId: string
  text: string
  documentId: string
}

export interface PublicDecisionLine {
  decisionId: string
  text: string
  filedText: string
  decisionDocumentId: string | null
  minutesDocumentId: string | null
}

const LIMIT = 100
export const AGENDA_PAGE_SIZE = 20

export interface PublicPage {
  page: number
  hasNext: boolean
}

export interface PublicBoardRecords {
  agendas: PublicAgendaLine[]
  agendaPage: PublicPage
  decisions: PublicDecisionLine[]
}

export async function loadPublicBoardRecords(
  db: Db,
  signal: AbortSignal,
  options: { agendaPage?: number } = {},
): Promise<PublicBoardRecords> {
  signal.throwIfAborted()
  const page = Math.max(1, Math.floor(options.agendaPage ?? 1))
  const agendaRows = await db
    .select({ meeting: boardMeetings, documentId: documents.id })
    .from(agendas)
    .innerJoin(boardMeetings, eq(boardMeetings.id, agendas.meetingId))
    .innerJoin(documents, eq(documents.id, agendas.documentId))
    .where(and(eq(agendas.status, 'published'), eq(documents.isPublic, true)))
    .orderBy(desc(boardMeetings.meetingDate), desc(boardMeetings.id))
    .limit(AGENDA_PAGE_SIZE + 1)
    .offset((page - 1) * AGENDA_PAGE_SIZE)
  const decisionRows = await db
    .select({ decision: boardDecisions, number: applications.number })
    .from(boardDecisions)
    .innerJoin(applications, eq(applications.id, boardDecisions.applicationId))
    .where(isNotNull(boardDecisions.filedOn))
    .orderBy(desc(boardDecisions.filedOn))
    .limit(LIMIT)
  const decisions: PublicDecisionLine[] = []
  for (const { decision, number } of decisionRows) {
    const app = await loadApplicationContext(db, decision.applicationId, signal)
    decisions.push({
      decisionId: decision.id,
      text: `${app?.typeBody.label ?? 'Application'} ${number}: ${OUTCOME_LABELS[decision.outcome]}, voted ${formatCivilDate(decision.votedOn)}`,
      filedText: decision.filedOn === null ? '' : formatCivilDate(decision.filedOn),
      decisionDocumentId: decision.writtenDecisionDocumentId,
      minutesDocumentId: decision.minutesDocumentId,
    })
  }
  return {
    agendas: agendaRows.slice(0, AGENDA_PAGE_SIZE).map((r) => ({
      meetingId: r.meeting.id,
      text: `${BOARD_NAMES[r.meeting.board]}, ${formatCivilDate(r.meeting.meetingDate)}`,
      documentId: r.documentId,
    })),
    agendaPage: { page, hasNext: agendaRows.length > AGENDA_PAGE_SIZE },
    decisions,
  }
}
