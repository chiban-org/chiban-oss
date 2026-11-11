import { and, count, eq, inArray, ne } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { complaints, documents, enforcementCases, enforcementNotes } from '@/db/schema'

async function countsBy(
  rows: Promise<{ caseId: string | null; n: number }[]>,
): Promise<Map<string, number>> {
  return new Map((await rows).map((r) => [r.caseId ?? '', r.n]))
}

export async function untouchedShells(
  db: Db | Tx,
  caseIds: readonly string[],
): Promise<Set<string>> {
  if (caseIds.length === 0) return new Set()
  const ids = [...caseIds]
  const intake = await db
    .select({ id: enforcementCases.id })
    .from(enforcementCases)
    .where(and(inArray(enforcementCases.id, ids), eq(enforcementCases.status, 'intake')))
  const [complaintCounts, noteCounts, otherDocuments] = await Promise.all([
    countsBy(
      db
        .select({ caseId: complaints.caseId, n: count() })
        .from(complaints)
        .where(inArray(complaints.caseId, ids))
        .groupBy(complaints.caseId),
    ),
    countsBy(
      db
        .select({ caseId: enforcementNotes.caseId, n: count() })
        .from(enforcementNotes)
        .where(inArray(enforcementNotes.caseId, ids))
        .groupBy(enforcementNotes.caseId),
    ),
    countsBy(
      db
        .select({ caseId: documents.recordId, n: count() })
        .from(documents)
        .where(
          and(
            eq(documents.recordKind, 'enforcement_case'),
            inArray(documents.recordId, ids),
            ne(documents.docKind, 'enforcement_photo'),
          ),
        )
        .groupBy(documents.recordId),
    ),
  ])
  return new Set(
    intake
      .map((c) => c.id)
      .filter(
        (id) =>
          complaintCounts.get(id) === 1 &&
          (noteCounts.get(id) ?? 0) === 0 &&
          (otherDocuments.get(id) ?? 0) === 0,
      ),
  )
}
