import type { CaseDetail } from '@/features/enforcement/caseDetail'
import { COURT_OUTCOMES } from '@/features/enforcement/courtOutcomes'
import { orderAvailableForFindings } from '@/features/enforcement/orderAvailability'
import type { CaseStageInput } from '@/features/enforcement/stageStrip'
import type { CaseWorkPlan } from '@/features/enforcement/workPlanTypes'

type StageDetail = Pick<CaseDetail, 'findings' | 'orders' | 'referrals' | 'remedies'>

function courtStepRecorded(detail: StageDetail): boolean {
  if (detail.orders.some((o) => o.steps.length > 0)) return true
  if ((detail.remedies?.civilActions.length ?? 0) > 0) return true
  return detail.referrals.some((r) => r.outcomes.some((o) => COURT_OUTCOMES.includes(o.kind)))
}

export function caseStageInput(
  detail: StageDetail,
  plan: Pick<CaseWorkPlan, 'status' | 'stayed' | 'due'>,
): CaseStageInput {
  const orderPossible = orderAvailableForFindings(detail.findings)
  return {
    status: plan.status,
    stayed: plan.stayed,
    violationFound: detail.findings.length > 0,
    orderIssued: detail.orders.some((o) => o.row.issuedOn !== null),
    inCourt: orderPossible
      ? detail.orders.some((o) => o.steps.length > 0)
      : courtStepRecorded(detail),
    overdue: plan.due !== null && plan.due.daysLeft < 0,
    orderPossible,
  }
}
