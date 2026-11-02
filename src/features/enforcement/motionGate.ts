import type { CeaseAndDesistRule } from '@packs/nh/schema'
import type { SubjectDue } from '@/features/clocks/subjectDue'
import type { ServiceStatus } from '@/features/enforcement/serviceStatus'
import type { StayState } from '@/features/enforcement/stay'
import { addDays, type CivilDate } from '@/types/civilDate'

export type MotionBlock =
  | 'service_incomplete'
  | 'answer_period_running'
  | 'answered'
  | 'not_filed_with_clerk'
  | { filingLeadUntil: CivilDate }
  | 'stayed'

export interface GateRecipient {
  answerDue: SubjectDue | null
  answeredOn: CivilDate | null
  served: boolean
}

function answerPeriodRunning(r: GateRecipient, today: CivilDate): boolean {
  if (r.answerDue === null) return r.served
  return today <= r.answerDue.due
}

export interface MotionGateInput {
  rule: CeaseAndDesistRule
  status: ServiceStatus
  recipients: readonly GateRecipient[]
  filedWithClerkOn: CivilDate | null
  stay: StayState
  today: CivilDate
}

export function motionBlocks(input: MotionGateInput): MotionBlock[] {
  const blocks: MotionBlock[] = []
  if (input.stay.stayed) blocks.push('stayed')
  if (!input.status.complete) blocks.push('service_incomplete')
  if (input.recipients.some((r) => r.answeredOn !== null)) blocks.push('answered')
  if (input.recipients.some((r) => answerPeriodRunning(r, input.today))) {
    blocks.push('answer_period_running')
  }
  if (input.filedWithClerkOn === null) {
    blocks.push('not_filed_with_clerk')
    return blocks
  }
  const opensOn = addDays(input.filedWithClerkOn, input.rule.courtFilingLeadDays)
  if (input.today < opensOn) blocks.push({ filingLeadUntil: opensOn })
  return blocks
}

export function motionGate(
  input: MotionGateInput,
): { open: true } | { open: false; blocks: MotionBlock[] } {
  const blocks = motionBlocks(input)
  return blocks.length === 0 ? { open: true } : { open: false, blocks }
}
