import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { SortState } from '@/features/dataTable/sort'
import { type CaseListPage, type CaseListRow, listCasePage } from '@/features/enforcement/caseList'
import type { CaseListFilters, CaseSortKey } from '@/features/enforcement/caseListParams'
import { type StayState, stayFor } from '@/features/enforcement/stay'
import type { CivilDate } from '@/types/civilDate'

export interface QueueRow extends CaseListRow {
  nextDue: { date: CivilDate; label: string } | null
  stay: StayState
}

export interface QueuePage extends Omit<CaseListPage, 'rows'> {
  rows: QueueRow[]
}

export async function listCaseQueue(
  db: DbOrTx,
  actor: Actor,
  input: {
    filters: CaseListFilters
    sort?: SortState<CaseSortKey>
    limit: number
    offset: number
  },
  today: CivilDate,
  signal: AbortSignal,
): Promise<QueuePage> {
  const page = await listCasePage(db, actor, input, today, signal)
  const rows: QueueRow[] = []
  for (const row of page.rows) {
    rows.push({
      ...row,
      nextDue:
        row.nextDueOn === null
          ? null
          : {
              date: row.nextDueOn,
              label: row.nextDueOn < today ? 'Answer overdue' : 'Answer due',
            },
      stay: await stayFor(db, row.caseId, today, signal),
    })
  }
  return { ...page, rows }
}
