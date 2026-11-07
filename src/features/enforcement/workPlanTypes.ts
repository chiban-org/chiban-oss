import type { RecipientRole } from '@packs/nh/schema'
import type { EnforcementStatus } from '@/db/schema'
import type { CivilDate } from '@/types/civilDate'

export type CaseActor = 'town' | 'respondent' | 'zba' | 'court' | 'counsel'

export type CaseMove = 'investigating' | 'no_violation' | 'resolved' | 'closed'

export type CourtStepKind = 'filed_with_clerk' | 'motion_to_enforce' | 'judgment'

export type CaseAction =
  | { kind: 'move'; to: CaseMove }
  | { kind: 'record_finding' }
  | { kind: 'send_notice' }
  | { kind: 'record_notice_receipt'; noticeId: string }
  | { kind: 'draft_order' }
  | { kind: 'issue_order'; orderId: string }
  | { kind: 'record_role_check'; orderId: string; role: RecipientRole }
  | { kind: 'list_recipient'; orderId: string; role: RecipientRole }
  | { kind: 'record_service'; orderId: string; recipientId: string | null }
  | { kind: 'record_court_step'; orderId: string; step: CourtStepKind }
  | { kind: 'record_fine_payment'; fineId: string }

export type CaseActionKind = CaseAction['kind']

export interface CaseRequirement {
  key: string
  label: string
  done: boolean
  detail: string
  anchor: string
}

export interface CaseRequirementGroup {
  key: string
  title: string
  rows: CaseRequirement[]
}

export interface CaseWarning {
  key: string
  text: string
}

export interface CaseNowStep {
  key: string
  task: string
  ask: string
  actor: CaseActor
  actorName: string | null
  note: string | null
  action: CaseAction | null
  warnings: CaseWarning[]
}

export interface CaseDue {
  key: 'answer' | 'judgment_appeal' | 'corrective_action'
  label: string
  date: CivilDate
  daysLeft: number
}

export interface CaseWorkPlan {
  status: EnforcementStatus
  stayed: boolean
  sentence: string
  now: CaseNowStep | null
  due: CaseDue | null
  groups: CaseRequirementGroup[]
  moves: CaseMove[]
}

export function actionKey(action: CaseAction): string {
  switch (action.kind) {
    case 'move':
      return `move:${action.to}`
    case 'record_notice_receipt':
      return `${action.kind}:${action.noticeId}`
    case 'issue_order':
    case 'record_role_check':
    case 'list_recipient':
    case 'record_service':
    case 'record_court_step':
      return `${action.kind}:${action.orderId}`
    case 'record_fine_payment':
      return `${action.kind}:${action.fineId}`
    case 'record_finding':
    case 'send_notice':
    case 'draft_order':
      return action.kind
  }
}

export function hostedActions(plan: CaseWorkPlan): ReadonlySet<string> {
  const action = plan.now?.action ?? null
  return new Set(action === null ? [] : [actionKey(action)])
}

export const NO_HOSTED: ReadonlySet<string> = new Set()
