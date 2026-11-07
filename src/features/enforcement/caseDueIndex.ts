import { and, inArray } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { enforcementCases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { enforcementCaseVisibleTo } from '@/features/enforcement/access'
import { loadCasePlanInputs } from '@/features/enforcement/casePlanInputs'
import { type CasePlanInput, caseDue } from '@/features/enforcement/workPlan'
import type { CaseDue } from '@/features/enforcement/workPlanTypes'
import type { CivilDate } from '@/types/civilDate'

export interface CaseDueIndex {
  today: CivilDate
  inputs: ReadonlyMap<string, CasePlanInput>
  dues: ReadonlyMap<string, CaseDue>
}

export async function loadCaseDueIndex(
  db: DbOrTx,
  actor: Actor | null,
  today: CivilDate,
  signal: AbortSignal,
): Promise<CaseDueIndex> {
  const cases = await db
    .select({ caseId: enforcementCases.id, status: enforcementCases.status })
    .from(enforcementCases)
    .where(
      and(
        enforcementCaseVisibleTo(actor),
        inArray(enforcementCases.status, ['order_issued', 'in_court']),
      ),
    )
  const inputs = await loadCasePlanInputs(db, cases, today, signal)
  const dues = new Map<string, CaseDue>()
  for (const [caseId, input] of inputs) {
    const due = caseDue(input)
    if (due !== null) dues.set(caseId, due)
  }
  return { today, inputs, dues }
}
