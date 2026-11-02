import { desc, eq, isNotNull } from 'drizzle-orm'
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

export async function loadPublicBoardRecords(
  db: Db,
  signal: AbortSignal,
): Promise<{ agendas: PublicAgendaLine[]; decisions: PublicDecisionLine[] }> {
  signal.throwIfAborted()
  const agendaRows = await db
    .select({
      meeting: boardMeetings,
      documentId: agendas.documentId,
      isPublic: documents.isPublic,
    })
    .from(agendas)
    .innerJoin(boardMeetings, eq(boardMeetings.id, agendas.meetingId))
    .innerJoin(documents, eq(documents.id, agendas.documentId))
    .where(eq(agendas.status, 'published'))
    .orderBy(desc(boardMeetings.meetingDate))
    .limit(LIMIT)
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
    agendas: agendaRows
      .filter((r) => r.isPublic && r.documentId !== null)
      .map((r) => ({
        meetingId: r.meeting.id,
        text: `${BOARD_NAMES[r.meeting.board]}, ${formatCivilDate(r.meeting.meetingDate)}`,
        documentId: r.documentId ?? '',
      })),
    decisions,
  }
}
