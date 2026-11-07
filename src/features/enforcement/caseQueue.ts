import { AppError, ErrorIds } from '@/constants/errorIds'
import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import type { SortState } from '@/features/dataTable/sort'
import { type CaseDueIndex, loadCaseDueIndex } from '@/features/enforcement/caseDueIndex'
import { type CaseListPage, type CaseListRow, listCasePage } from '@/features/enforcement/caseList'
import type { CaseListFilters, CaseSortKey } from '@/features/enforcement/caseListParams'
import { EVERY_CASE_ABILITY, type NextStep, nextStepOf } from '@/features/enforcement/caseNextStep'
import { loadCasePlanInputs } from '@/features/enforcement/casePlanInputs'
import type { StayState } from '@/features/enforcement/stay'
import { planCaseWork } from '@/features/enforcement/workPlan'
import type { CaseDue } from '@/features/enforcement/workPlanTypes'
import type { CivilDate } from '@/types/civilDate'

export interface QueueRow extends CaseListRow {
  nextStep: NextStep | null
  due: CaseDue | null
  stay: Pick<StayState, 'stayed'>
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
  index?: CaseDueIndex,
): Promise<QueuePage> {
  const due = index ?? (await loadCaseDueIndex(db, actor, today, signal))
  const page = await listCasePage(db, actor, input, today, signal, due)
  const missing = page.rows.filter((row) => !due.inputs.has(row.caseId))
  const loaded = await loadCasePlanInputs(db, missing, today, signal)
  const rows = page.rows.map((row): QueueRow => {
    const planInput = due.inputs.get(row.caseId) ?? loaded.get(row.caseId)
    if (planInput === undefined)
      throw new AppError(ErrorIds.ENF_INVARIANT, 'No plan input for a listed case', {
        caseId: row.caseId,
      })
    const plan = planCaseWork(planInput, { abilities: EVERY_CASE_ABILITY, responsible: null })
    return {
      ...row,
      nextStep: nextStepOf(plan),
      due: plan.due,
      stay: { stayed: planInput.stay.stayed },
    }
  })
  return { ...page, rows }
}
