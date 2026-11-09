import { desc, eq, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, boardDecisions, boardMeetings, boards, parcels, projects } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import type { PublicPage } from '@/features/hearings/publicMeetings'
import { decisionOutcome } from '@/features/parcels/openGroups'
import type { CivilDate } from '@/types/civilDate'

export interface PublicDecision {
  decisionId: string
  applicationId: string
  applicationNumber: string
  typeLabel: string
  boardShortName: string
  outcome: ReturnType<typeof decisionOutcome>
  votedOn: CivilDate
  filedOn: CivilDate | null
  parcel: { id: string; address: string | null }
  decisionDocumentId: string | null
  minutesDocumentId: string | null
}

export const DECISION_PAGE_SIZE = 20

export async function loadPublicDecisions(
  db: DbOrTx,
  options: { page: number },
  signal: AbortSignal,
): Promise<{ decisions: PublicDecision[]; page: PublicPage }> {
  signal.throwIfAborted()
  const page = Math.max(1, Math.floor(options.page))
  const rows = await db
    .select({
      decision: boardDecisions,
      number: applications.number,
      boardKind: boards.kind,
      boardShortName: boards.shortName,
      parcelId: projects.parcelId,
      address: parcels.siteAddress,
    })
    .from(boardDecisions)
    .innerJoin(applications, eq(applications.id, boardDecisions.applicationId))
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .leftJoin(parcels, eq(parcels.id, projects.parcelId))
    .innerJoin(boardMeetings, eq(boardMeetings.id, boardDecisions.meetingId))
    .innerJoin(boards, eq(boards.id, boardMeetings.boardId))
    .where(isNotNull(boardDecisions.filedOn))
    .orderBy(desc(boardDecisions.filedOn), desc(boardDecisions.id))
    .limit(DECISION_PAGE_SIZE + 1)
    .offset((page - 1) * DECISION_PAGE_SIZE)
  const decisions: PublicDecision[] = []
  for (const row of rows.slice(0, DECISION_PAGE_SIZE)) {
    const { decision } = row
    const app = await loadApplicationContext(db, decision.applicationId, signal)
    decisions.push({
      decisionId: decision.id,
      applicationId: decision.applicationId,
      applicationNumber: row.number,
      typeLabel: app?.typeBody.label ?? 'Application',
      boardShortName: row.boardShortName,
      outcome: decisionOutcome(decision.outcome, row.boardKind),
      votedOn: decision.votedOn as CivilDate,
      filedOn: decision.filedOn as CivilDate | null,
      parcel: { id: row.parcelId, address: row.address },
      decisionDocumentId: decision.writtenDecisionDocumentId,
      minutesDocumentId: decision.minutesDocumentId,
    })
  }
  return { decisions, page: { page, hasNext: rows.length > DECISION_PAGE_SIZE } }
}
