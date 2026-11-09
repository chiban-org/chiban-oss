import type { DecisionOutcome } from '@packs/nh/schema'
import { desc, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { boardDecisions, boardMeetings, boards, type DecisionCondition } from '@/db/schema'
import type { CivilDate } from '@/types/civilDate'

export interface LatestDecision {
  applicationId: string
  outcome: DecisionOutcome
  boardKind: string
  votedOn: CivilDate
  conditions: DecisionCondition[]
}

export async function latestDecisions(
  db: DbOrTx,
  applicationIds: readonly string[],
): Promise<Map<string, LatestDecision>> {
  if (applicationIds.length === 0) return new Map()
  const rows = await db
    .select({
      applicationId: boardDecisions.applicationId,
      outcome: boardDecisions.outcome,
      boardKind: boards.kind,
      votedOn: boardDecisions.votedOn,
      conditions: boardDecisions.conditions,
    })
    .from(boardDecisions)
    .innerJoin(boardMeetings, eq(boardMeetings.id, boardDecisions.meetingId))
    .innerJoin(boards, eq(boards.id, boardMeetings.boardId))
    .where(inArray(boardDecisions.applicationId, [...applicationIds]))
    .orderBy(desc(boardDecisions.votedOn), desc(boardDecisions.recordedAt))
  const latest = new Map<string, LatestDecision>()
  for (const row of rows) {
    if (latest.has(row.applicationId)) continue
    latest.set(row.applicationId, { ...row, votedOn: row.votedOn as CivilDate })
  }
  return latest
}
