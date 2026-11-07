import type { EnforcementStatus } from '@/db/schema'
import {
  type CasePlanExtras,
  type CasePlanInput,
  type CasePlanOrder,
  planCaseWork,
} from '@/features/enforcement/workPlan'
import type { CaseActionKind } from '@/features/enforcement/workPlanTypes'
import type { CivilDate } from '@/types/civilDate'

export const PLAN_TODAY = '2026-11-07' as CivilDate

export const ALL_CASE_ABILITIES: ReadonlySet<CaseActionKind> = new Set<CaseActionKind>([
  'move',
  'record_finding',
  'send_notice',
  'record_notice_receipt',
  'draft_order',
  'issue_order',
  'record_role_check',
  'list_recipient',
  'record_service',
  'record_court_step',
  'record_fine_payment',
])

export const PLAN_EXTRAS: CasePlanExtras = {
  abilities: ALL_CASE_ABILITIES,
  responsible: 'Sam Clerk',
}

export const OPEN_FINDING = [{ status: 'open' as const }]

export const ANSWER_DUE: CasePlanOrder['answerDues'] = [
  { name: 'Larkspur Family Trust', due: { due: '2026-11-20' as CivilDate }, answeredOn: null },
]

export function planInput(
  status: EnforcementStatus,
  overrides: Partial<CasePlanInput> = {},
): CasePlanInput {
  return {
    staff: { row: { status } },
    today: PLAN_TODAY,
    stay: { stayed: false, reason: null },
    banner: null,
    findings: [],
    notices: [],
    orders: [],
    fines: [],
    referrals: [],
    ...overrides,
  }
}

export function planOrder(
  overrides: Partial<CasePlanOrder> = {},
  row: Partial<CasePlanOrder['row']> = {},
): CasePlanOrder {
  return {
    row: {
      id: 'o1',
      number: 'CD-2026-0001',
      status: 'issued',
      issuedOn: '2026-10-29',
      correctiveAction: 'Stop renting the second dwelling.',
      correctiveDeadline: '2026-12-13',
      ...row,
    },
    rule: {
      recipientRoles: ['record_owner', 'owner_agent', 'occupying_tenant'],
      ownerRoles: ['record_owner', 'owner_agent'],
    },
    status: { missing: [], servedOn: { r1: '2026-11-01' as CivilDate } },
    service: {
      recipients: [
        { id: 'r1', role: 'record_owner', name: 'Larkspur Family Trust' },
        { id: 'r2', role: 'occupying_tenant', name: 'Robin Renter' },
      ],
    },
    steps: [],
    gate: { open: false, blocks: ['not_filed_with_clerk'] },
    answerDues: [],
    appealDue: null,
    ...overrides,
  }
}

export function planFor(input: CasePlanInput, extras = PLAN_EXTRAS) {
  return planCaseWork(input, extras)
}
