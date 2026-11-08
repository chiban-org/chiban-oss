import type { WorkWarning } from '@/components/layout/WorkPlan'
import type { RtkRequestView } from '@/features/rtk/requests'
import type { CivilDate } from '@/types/civilDate'

export interface PlanApproval {
  releasedIn: number | null
  revoked: boolean
  redacted: boolean
  cited: boolean
}

export interface RequestPlanInput {
  request: Pick<
    RtkRequestView,
    | 'status'
    | 'firstResponseKind'
    | 'firstResponseOn'
    | 'statedDue'
    | 'deniedOn'
    | 'timeliness'
    | 'current'
  > & { withholdings: number }
  approvals: readonly PlanApproval[]
}

export type RequestStepKind = 'respond' | 'release' | 'close'

export interface RequestNowStep {
  kind: RequestStepKind
  task: string
  note: string | null
  warnings: WorkWarning[]
}

export interface RequestDue {
  label: string
  date: CivilDate
  daysLeft: number
}

export interface RequirementRow {
  key: string
  done: boolean
  label: string
  detail: string
  anchor: string
}

export interface RequirementGroup {
  key: string
  title: string
  items: RequirementRow[]
}

export interface RequestWorkPlan {
  sentence: string
  now: RequestNowStep | null
  due: RequestDue | null
  groups: RequirementGroup[]
  pending: number
}
