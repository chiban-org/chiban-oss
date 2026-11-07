import type { CeaseAndDesistRule, RecipientRole } from '@packs/nh/schema'
import type {
  EnforcementStatus,
  enforcementFines,
  enforcementOrders,
  orderCourtSteps,
  violationFindings,
  violationNotices,
} from '@/db/schema'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import type { MotionBlock } from '@/features/enforcement/motionGate'
import type { ServiceStatus } from '@/features/enforcement/serviceStatus'
import type { StayState } from '@/features/enforcement/stay'
import type { CivilDate } from '@/types/civilDate'
import type { CaseActionKind } from './workPlanTypes'

type OrderRow = typeof enforcementOrders.$inferSelect
type StepRow = typeof orderCourtSteps.$inferSelect

export interface CasePlanOrder {
  row: Pick<
    OrderRow,
    'id' | 'number' | 'status' | 'issuedOn' | 'correctiveAction' | 'correctiveDeadline'
  >
  rule: Pick<CeaseAndDesistRule, 'recipientRoles' | 'ownerRoles'>
  status: Pick<ServiceStatus, 'missing' | 'servedOn'>
  service: { recipients: readonly { id: string; role: RecipientRole; name: string }[] }
  steps: readonly Pick<StepRow, 'kind' | 'occurredOn' | 'judgmentOutcome'>[]
  gate: { open: true } | { open: false; blocks: MotionBlock[] }
  answerDues: readonly { name: string; due: Pick<SubjectDue, 'due'>; answeredOn: string | null }[]
  appealDue: Pick<SubjectDue, 'due'> | null
}

export interface CasePlanInput {
  staff: { row: { status: EnforcementStatus } }
  today: CivilDate
  stay: Pick<StayState, 'stayed' | 'reason'>
  banner: string | null
  findings: readonly Pick<typeof violationFindings.$inferSelect, 'status'>[]
  notices: readonly Pick<typeof violationNotices.$inferSelect, 'id' | 'receivedOn'>[]
  orders: readonly CasePlanOrder[]
  fines: readonly { row: Pick<typeof enforcementFines.$inferSelect, 'id'>; dueCents: number }[]
  referrals: readonly { outcomes: readonly { kind: string }[] }[]
}

export interface CasePlanExtras {
  abilities: ReadonlySet<CaseActionKind>
  responsible: string | null
}

const NOT_LIVE: readonly OrderRow['status'][] = ['draft', 'annulled', 'withdrawn', 'complied']

export function liveOrder(input: CasePlanInput): CasePlanOrder | null {
  const live = input.orders.filter((o) => !NOT_LIVE.includes(o.row.status))
  return live.find((o) => stepOf(o, 'judgment') === null) ?? live[0] ?? null
}

export function unservedFor(order: CasePlanOrder, role: RecipientRole) {
  const roles = role === order.rule.ownerRoles[0] ? order.rule.ownerRoles : [role]
  return order.service.recipients.filter(
    (r) => roles.includes(r.role) && order.status.servedOn[r.id] === undefined,
  )
}

export function draftOrderOf(input: CasePlanInput): CasePlanOrder | null {
  return input.orders.find((o) => o.row.status === 'draft') ?? null
}

export function stepOf(order: CasePlanOrder, kind: StepRow['kind']) {
  return order.steps.find((s) => s.kind === kind) ?? null
}

export function gateBlocks(order: CasePlanOrder): MotionBlock[] {
  return order.gate.open ? [] : order.gate.blocks
}

export function filingLead(order: CasePlanOrder): CivilDate | null {
  const lead = gateBlocks(order).find((b) => typeof b !== 'string')
  return lead === undefined ? null : lead.filingLeadUntil
}

export function runningAnswers(order: CasePlanOrder, today: CivilDate) {
  return order.answerDues
    .filter((a) => a.answeredOn === null && a.due.due >= today)
    .sort((a, b) => a.due.due.localeCompare(b.due.due))
}
