import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { enforcementOrders, orderServiceRecipients } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { type CaseListFilters, type CaseListRow, listCases } from '@/features/enforcement/access'
import { answerDueOf } from '@/features/enforcement/answers'
import { type StayState, stayFor } from '@/features/enforcement/stay'
import type { CivilDate } from '@/types/civilDate'

export interface QueueRow extends CaseListRow {
  nextDue: { date: CivilDate; label: string } | null
  stay: StayState
}

export async function listCaseQueue(
  db: DbOrTx,
  actor: Actor,
  input: { filters: CaseListFilters; limit: number; cursor?: string },
  today: CivilDate,
  signal: AbortSignal,
): Promise<{ rows: QueueRow[]; nextCursor: string | null }> {
  const page = await listCases(db, actor, input, signal)
  const ids = page.rows.map((r) => r.caseId)
  const dues =
    ids.length === 0
      ? []
      : await db
          .select({ caseId: enforcementOrders.caseId, answerDue: orderServiceRecipients.answerDue })
          .from(orderServiceRecipients)
          .innerJoin(enforcementOrders, eq(enforcementOrders.id, orderServiceRecipients.orderId))
          .where(
            and(
              inArray(enforcementOrders.caseId, ids),
              isNotNull(orderServiceRecipients.answerDue),
            ),
          )
  const byCase = new Map<string, CivilDate>()
  for (const row of dues) {
    const due = answerDueOf(row)
    if (due === null || due.due < today) continue
    const held = byCase.get(row.caseId)
    if (held === undefined || due.due < held) byCase.set(row.caseId, due.due)
  }
  const rows: QueueRow[] = []
  for (const row of page.rows) {
    const date = byCase.get(row.caseId)
    rows.push({
      ...row,
      nextDue: date === undefined ? null : { date, label: 'Answer due' },
      stay: await stayFor(db, row.caseId, today, signal),
    })
  }
  return { rows, nextCursor: page.nextCursor }
}
