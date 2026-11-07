import type { Role } from '@/constants/roles'
import type { EnforcementStatus } from '@/db/schema'
import type { CaseWorkPlan } from './workPlanTypes'

export interface CaseViewInput {
  roles: readonly Role[]
  manages: boolean
  recordsService: boolean
  refersCounsel: boolean
  assigned: boolean
}

export type CaseView = 'office' | 'field' | 'counsel'

export function caseViewFor(input: CaseViewInput): CaseView {
  if (input.refersCounsel && !input.manages && !input.recordsService) return 'counsel'
  const fieldOnly = input.roles.includes('inspector') && !input.roles.includes('staff')
  return fieldOnly && input.recordsService && !input.assigned ? 'field' : 'office'
}

const IN_FORCE: readonly EnforcementStatus[] = ['order_issued', 'in_court']

export function counselReferralApplies(plan: Pick<CaseWorkPlan, 'status' | 'stayed'>): boolean {
  return IN_FORCE.includes(plan.status) && !plan.stayed
}
