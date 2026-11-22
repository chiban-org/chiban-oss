import type { EnforcementStatus } from '@/db/schema'
import { cureRules } from '@/features/enforcement/cureRules'
import { ROLE_LABELS } from '@/features/enforcement/labels'
import type { RecipientRole } from '@/features/packs/schema'
import { boardAbbrev } from '@/features/packs/vocabulary'
import { formatCivilDate } from '@/lib/formatDate'
import { noticeOfViolationSent } from './noticeRequirement'
import { orderAvailableForFindings } from './orderAvailability'
import { cureStep } from './workPlanCure'
import {
  type CasePlanInput,
  type CasePlanOrder,
  counselState,
  draftIsStale,
  draftOrderOf,
  filingLead,
  findingStanding,
  gateBlocks,
  liveOrder,
  runningAnswers,
  stepOf,
  unservedFor,
} from './workPlanInput'
import {
  correctionWaitStep,
  judgmentStep,
  noOrderCounselStep,
  resolveStep,
  type Step,
  town,
  waiting,
} from './workPlanNoOrder'

export type { Step }

export function roleName(item: { role: RecipientRole }): string {
  return ROLE_LABELS[item.role].toLowerCase()
}

function issueStep(draft: CasePlanOrder): Step {
  const note =
    draft.row.correctiveAction === ''
      ? 'Write the corrective action in the draft before issuing it.'
      : null
  return town(
    'order.issued',
    `Issue order ${draft.row.number}`,
    { kind: 'issue_order', orderId: draft.row.id },
    note,
  )
}

function noViolationStep(): Step {
  return town('move:no_violation', 'Record no violation', { kind: 'move', to: 'no_violation' })
}

function redraftStep(draft: CasePlanOrder): Step {
  return town(
    'order.redraft',
    `Discard draft order ${draft.row.number} and draft a new one`,
    null,
    'The draft includes a finding that was withdrawn or marked corrected, so it cannot be issued. Discard it in the orders panel.',
  )
}

function draftStep(input: CasePlanInput, draft: CasePlanOrder): Step {
  return draftIsStale(input.findings, draft.row.findingIds) ? redraftStep(draft) : issueStep(draft)
}

function cureRouting(): string | null {
  const rules = cureRules()
  if (rules.length === 0) return null
  return rules
    .map(
      (rule) =>
        `If the ${rule.label.toLowerCase()} applies, choose it under Cure notice before sending a notice of violation.`,
    )
    .join(' ')
}

function violationStep(input: CasePlanInput): Step {
  const standing = findingStanding(input)
  if (standing === 'corrected') return resolveStep()
  if (standing === 'withdrawn') return noViolationStep()
  const cure = cureStep(input)
  const lapsedDraft =
    cure?.key === 'cure.remedy' && orderAvailableForFindings(input.findings)
      ? draftOrderOf(input)
      : null
  if (lapsedDraft !== null) return draftStep(input, lapsedDraft)
  if (cure !== null) return cure
  if (!noticeOfViolationSent(input.notices)) {
    return town('notice.sent', 'Send a notice of violation', { kind: 'send_notice' }, cureRouting())
  }
  const ordered = orderAvailableForFindings(input.findings)
  const draft = ordered ? draftOrderOf(input) : null
  if (draft !== null) return draftStep(input, draft)
  const unreceived = input.notices.find((n) => n.receivedOn === null)
  if (unreceived !== undefined && !input.notices.some((n) => n.receivedOn !== null)) {
    return town('notice.received', 'Record when the notice was received', {
      kind: 'record_notice_receipt',
      noticeId: unreceived.id,
    })
  }
  if (!ordered) return correctionWaitStep(input) ?? noOrderCounselStep(input)
  return town('order.drafted', 'Draft a cease and desist order', { kind: 'draft_order' })
}

function serviceStep(order: CasePlanOrder): Step | null {
  const roles = order.rule.recipientRoles
  const gap = [...order.status.missing].sort(
    (a, b) => roles.indexOf(a.role) - roles.indexOf(b.role),
  )[0]
  if (gap === undefined) return null
  const orderId = order.row.id
  const key = `service:${gap.role}`
  if (gap.reason === 'no_check') {
    return town(key, `Record the check for the ${roleName(gap)}`, {
      kind: 'record_role_check',
      orderId,
      role: gap.role,
    })
  }
  if (gap.reason === 'publication_incomplete') {
    return town(key, `Finish posting and publication for the ${roleName(gap)}`, {
      kind: 'record_service',
      orderId,
      recipientId: null,
    })
  }
  const unserved = unservedFor(order, gap.role)[0]
  if (unserved === undefined) {
    return town(key, `List the ${roleName(gap)}`, {
      kind: 'list_recipient',
      orderId,
      role: gap.role,
    })
  }
  return town(key, `Serve ${unserved.name}`, {
    kind: 'record_service',
    orderId,
    recipientId: unserved.id,
  })
}

function answerStep(input: CasePlanInput, order: CasePlanOrder): Step {
  const running = runningAnswers(order, input.today)
  const names = running.map((a) => a.name)
  const due = running[0]?.due.due
  return {
    ...waiting({
      key: 'court.answer_period',
      actor: 'respondent',
      ask: 'Answer the order',
      task: 'Wait for the answer',
      note: due === undefined ? null : `Answer due ${formatCivilDate(due)}.`,
    }),
    actorName: names.length === 0 ? null : [...new Set(names)].join(', '),
  }
}

function counselStep(input: CasePlanInput): Step {
  const counsel = counselState(input)
  if (counsel === 'won') return judgmentStep(input)
  if (counsel === 'ended') return resolveStep()
  if (counsel === 'open') {
    const task = 'Take the answered order to court'
    return waiting({ key: 'court.answered', actor: 'counsel', ask: task, task })
  }
  return town(
    'court.answered',
    'Refer the case to town counsel',
    null,
    'An answer was received, so the motion to enforce cannot be filed. Town counsel takes an answered order to court.',
  )
}

function beforeMotionStep(input: CasePlanInput, order: CasePlanOrder): Step {
  const orderId = order.row.id
  const blocks = gateBlocks(order)
  if (blocks.includes('answered')) return counselStep(input)
  if (stepOf(order, 'filed_with_clerk') === null) {
    return town('court.filed', `File order ${order.row.number} with the court clerk`, {
      kind: 'record_court_step',
      orderId,
      step: 'filed_with_clerk',
    })
  }
  if (blocks.includes('answer_period_running')) return answerStep(input, order)
  const lead = filingLead(order)
  if (lead !== null) {
    return town(
      'court.filing_lead',
      `File the motion to enforce on or after ${formatCivilDate(lead)}`,
      null,
      'The motion can be filed no earlier than five days after filing with the clerk.',
    )
  }
  return town('court.motion', 'File the motion to enforce', {
    kind: 'record_court_step',
    orderId,
    step: 'motion_to_enforce',
  })
}

function orderStep(input: CasePlanInput, order: CasePlanOrder): Step {
  if (stepOf(order, 'judgment') !== null) return judgmentStep(input)
  if (stepOf(order, 'motion_to_enforce') !== null) {
    return {
      ...waiting({
        key: 'court.judgment',
        actor: 'court',
        ask: 'Rule on the motion to enforce',
        task: 'Record the judgment',
      }),
      action: { kind: 'record_court_step', orderId: order.row.id, step: 'judgment' },
    }
  }
  return serviceStep(order) ?? beforeMotionStep(input, order)
}

function afterOrderStep(input: CasePlanInput): Step {
  if (findingStanding(input) === 'withdrawn') return judgmentStep(input)
  const draft = draftOrderOf(input)
  if (draft !== null && input.staff.row.status === 'order_issued') return draftStep(input, draft)
  const live = liveOrder(input)
  return live === null ? resolveStep() : orderStep(input, live)
}

export function stayStepTask(): string {
  return `Wait for the ${boardAbbrev('zba')} decision`
}

function stayStep(): Step {
  return waiting({
    key: 'stay',
    actor: 'zba',
    ask: 'Decide the appeal',
    task: stayStepTask(),
  })
}

const STAYABLE: readonly EnforcementStatus[] = ['violation_found', 'order_issued', 'in_court']

export function currentStep(input: CasePlanInput): Step | null {
  const status = input.staff.row.status
  if (input.stay.stayed && STAYABLE.includes(status)) return stayStep()
  switch (status) {
    case 'intake':
      return town('move:investigating', 'Start the investigation', {
        kind: 'move',
        to: 'investigating',
      })
    case 'investigating':
      return town('finding', 'Record a finding', { kind: 'record_finding' })
    case 'violation_found':
      return violationStep(input)
    case 'order_issued':
    case 'in_court':
      return afterOrderStep(input)
    case 'resolved':
      return town('move:closed', 'Close the case', { kind: 'move', to: 'closed' })
    case 'no_violation':
    case 'closed':
      return null
  }
}
