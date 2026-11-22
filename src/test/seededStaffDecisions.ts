import { and, eq, inArray, isNull, like } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { appealNodes, applications, documents, projects } from '@/db/schema'
import { loadApplicationContext } from '@/features/applications/context'
import { STAFF_DECISION_LETTER_TITLE } from '@/features/applications/staffDecision'
import { boardOfApplication } from '@/features/boards/boardOf'
import { TITLE_PREFIX } from '@/features/demo/seedPermitSupport'

const signal = new AbortController().signal

export interface SeededStaffDecision {
  number: string
  state: string
  decided: boolean
  registerEntries: number
  letters: number
}

export async function seededStaffDecisions(db: Db): Promise<SeededStaffDecision[]> {
  const rows = await db
    .select({
      id: applications.id,
      number: applications.number,
      state: applications.state,
      decidedOn: applications.decidedOn,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(
      and(
        like(projects.title, `${TITLE_PREFIX}%`),
        inArray(applications.state, ['decided', 'issued']),
      ),
    )
  const found: SeededStaffDecision[] = []
  for (const row of rows) {
    const app = await loadApplicationContext(db, row.id, signal)
    if (app === null || boardOfApplication(app) !== null) continue
    const nodes = await db
      .select({ id: appealNodes.id })
      .from(appealNodes)
      .where(
        and(eq(appealNodes.applicationId, row.id), eq(appealNodes.kind, 'administrative_decision')),
      )
    const letters = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.recordId, row.id),
          eq(documents.title, STAFF_DECISION_LETTER_TITLE),
          isNull(documents.supersededBy),
        ),
      )
    found.push({
      number: row.number,
      state: row.state,
      decided: row.decidedOn !== null,
      registerEntries: nodes.length,
      letters: letters.length,
    })
  }
  return found
}

export function expectedStaffDecision(row: SeededStaffDecision): SeededStaffDecision {
  return { ...row, registerEntries: 1, letters: row.decided ? 1 : 0 }
}
