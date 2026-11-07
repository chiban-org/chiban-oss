import type { RecipientRole } from '@packs/nh/schema'
import { MOTION_BLOCK_TEXT } from '@/features/enforcement/labels'
import { formatCivilDate } from '@/lib/formatDate'
import { formatCents } from '@/lib/money'
import { rolesToServe } from './serviceStatus'
import {
  type CasePlanInput,
  type CasePlanOrder,
  counselState,
  filingLead,
  gateBlocks,
  liveOrder,
  runningAnswers,
  stepOf,
  unservedFor,
} from './workPlanInput'
import { roleName } from './workPlanSteps'
import type { CaseRequirement, CaseRequirementGroup } from './workPlanTypes'

const ANCHORS: readonly [string, string][] = [
  ['finding', 'findings'],
  ['notice.', 'findings'],
  ['fines.', 'fines'],
  ['stay', 'appeals'],
  ['counsel.', 'counsel'],
]

function anchorOf(key: string): string {
  return ANCHORS.find(([prefix]) => key.startsWith(prefix))?.[1] ?? 'orders'
}

function row(key: string, label: string, done: boolean, detail = ''): CaseRequirement {
  return { key, label, done, detail: done ? '' : detail, anchor: anchorOf(key) }
}

const findingRow = (input: CasePlanInput) =>
  row('finding', 'Finding recorded', input.findings.length > 0)

function orderGroup(input: CasePlanInput): CaseRequirementGroup {
  const notice = input.notices.length > 0
  const drafted = input.orders.some((o) => o.row.status !== 'withdrawn')
  return {
    key: 'order',
    title: 'Before the order is issued',
    rows: [
      findingRow(input),
      row('notice.sent', 'Notice of violation sent', notice),
      row(
        'notice.received',
        'Receipt of the notice recorded',
        input.notices.some((n) => n.receivedOn !== null),
        'Penalty accrual starts when written notice is received.',
      ),
      row('order.drafted', 'Order drafted', drafted),
      row(
        'order.issued',
        'Order issued',
        false,
        'Only an officer on record as designated by the town can issue the order.',
      ),
    ],
  }
}

function serviceDetail(order: CasePlanOrder, role: RecipientRole): string {
  const gap = order.status.missing.find((m) => m.role === role)
  if (gap === undefined) return ''
  if (gap.reason === 'no_check') return 'Not yet checked.'
  if (gap.reason === 'publication_incomplete') return 'Posting and publication not complete.'
  const unserved = unservedFor(order, role).map((r) => r.name)
  return unserved.length === 0 ? 'No one is listed.' : `Not served: ${unserved.join(', ')}.`
}

function serviceRows(order: CasePlanOrder): CaseRequirement[] {
  return rolesToServe(order.rule).map((role) =>
    row(
      `service:${role}`,
      `Service on the ${roleName({ role })}`,
      !order.status.missing.some((m) => m.role === role),
      serviceDetail(order, role),
    ),
  )
}

function motionGroup(input: CasePlanInput, order: CasePlanOrder): CaseRequirementGroup {
  const blocks = gateBlocks(order)
  const filed = stepOf(order, 'filed_with_clerk') !== null
  const answerDue = runningAnswers(order, input.today)[0]?.due.due
  const lead = filingLead(order)
  const stay = input.stay.stayed
    ? [row('stay', 'No appeal stay in effect', false, input.banner ?? MOTION_BLOCK_TEXT.stayed)]
    : []
  return {
    key: 'motion',
    title: 'Before the motion to enforce',
    rows: [
      ...stay,
      ...serviceRows(order),
      row('court.filed', 'Filed with the court clerk', filed),
      row(
        'court.answer_period',
        'Answer period over',
        !blocks.includes('answer_period_running'),
        answerDue === undefined
          ? MOTION_BLOCK_TEXT.answer_period_running
          : `Answer due ${formatCivilDate(answerDue)}.`,
      ),
      row(
        'court.answered',
        'No answer received',
        !blocks.includes('answered'),
        MOTION_BLOCK_TEXT.answered,
      ),
      row(
        'court.filing_lead',
        'Five days since filing with the clerk',
        filed && lead === null,
        lead === null ? '' : `The motion can be filed no earlier than ${formatCivilDate(lead)}.`,
      ),
    ],
  }
}

function fineRows(input: CasePlanInput): CaseRequirement[] {
  const owed = input.fines.reduce((sum, f) => sum + f.dueCents, 0)
  if (input.fines.length === 0) return []
  return [row('fines.paid', 'Fines paid', owed === 0, `Balance due ${formatCents(owed)}.`)]
}

function resolveGroup(input: CasePlanInput, order: CasePlanOrder): CaseRequirementGroup {
  return {
    key: 'resolve',
    title: 'Before the case is resolved',
    rows: [
      row('court.motion', 'Motion to enforce filed', true),
      row('court.judgment', 'Judgment entered', stepOf(order, 'judgment') !== null),
      ...fineRows(input),
    ],
  }
}

function counselGroup(input: CasePlanInput): CaseRequirementGroup {
  const counsel = counselState(input)
  return {
    key: 'resolve',
    title: 'Before the case is resolved',
    rows: [
      row('counsel.referred', 'Referred to town counsel', counsel !== 'none'),
      row(
        'counsel.decided',
        'Counsel proceedings decided',
        counsel === 'won' || counsel === 'ended',
      ),
      ...fineRows(input),
    ],
  }
}

function courtGroups(input: CasePlanInput): CaseRequirementGroup[] {
  const order = liveOrder(input)
  if (order === null) return []
  if (stepOf(order, 'motion_to_enforce') !== null) return [resolveGroup(input, order)]
  if (gateBlocks(order).includes('answered') && counselState(input) !== 'none') {
    return [counselGroup(input)]
  }
  return [motionGroup(input, order)]
}

export function requirementGroups(input: CasePlanInput): CaseRequirementGroup[] {
  switch (input.staff.row.status) {
    case 'investigating':
      return [{ key: 'finding', title: 'Before a violation is found', rows: [findingRow(input)] }]
    case 'violation_found':
      return [orderGroup(input)]
    case 'order_issued':
    case 'in_court':
      return courtGroups(input)
    case 'intake':
    case 'no_violation':
    case 'resolved':
    case 'closed':
      return []
  }
}
