import type { ClockRule } from '@packs/nh/schema'
import type { clockAdjustments, clocks } from '@/db/schema'
import type { Sourced } from '@/features/fees/sourced'
import { type CivilDate, daysBetween } from '@/types/civilDate'

type ClockRow = typeof clocks.$inferSelect
type AdjustmentRow = typeof clockAdjustments.$inferSelect

export const START_EVENT_LABELS: Record<string, string> = {
  application_received: 'Application received',
  application_completed: 'Application completed',
  permit_issued: 'Permit issued',
  regional_impact_notice_mailed: 'Regional impact notice mailed',
  acceptance_meeting_set: 'Meeting set',
  application_accepted: 'Application accepted as complete',
  final_approval: 'Final approval',
  board_vote: 'Board vote',
  decision_filed: 'Decision filed',
  rehearing_vote: 'Rehearing vote',
  administrative_decision: 'Administrative decision',
  order_served: 'Order served',
  judgment_entered: 'Judgment entered',
  rtk_request_received: 'Request received',
  rtk_time_statement: 'Time statement made',
}

export interface ClockExplanation {
  ruleLabel: string
  citation: { label: string; url: string | null }
  ruleKey: string
  ruleVersion: number
  packVersion: string
  startEvent: string
  startDate: CivilDate
  countingMethod: string
  computedDue: CivilDate
  currentDue: Sourced<CivilDate>
  rolledFrom: CivilDate | null
  adjustments: {
    kind: string
    days: number | null
    newDue: CivilDate | null
    reason: string
    legalAuthority: { citation: string; explanation: string } | null
    by: string
    at: Date
  }[]
  consequence: string
  consequenceKind: ClockRule['consequence']['kind']
  whose: ClockRule['whose']
  extensionPolicy: string
  allowedAdjustments: AdjustmentKind[]
  status: ClockRow['status']
  metOn: CivilDate | null
  daysRemaining: number
}

export type AdjustmentKind = 'extension' | 'waiver' | 'statutory_exception'

export function allowedAdjustmentKinds(rule: ClockRule): AdjustmentKind[] {
  return [
    ...(rule.extension.allowed ? (['extension'] as const) : []),
    ...(rule.waivable ? (['waiver'] as const) : []),
    'statutory_exception',
  ]
}

export function extensionPolicyText(rule: ClockRule): string {
  if (!rule.extension.allowed) return rule.extension.note
  if (rule.extension.by === 'applicant_consent')
    return 'May be extended with the applicant’s consent.'
  if (rule.extension.by === 'board_good_cause')
    return 'May be extended by the board for good cause.'
  return 'May be extended by renewal.'
}

function currentDueOf(clock: ClockRow, adjusted: boolean): Sourced<CivilDate> {
  const due = clock.currentDue as CivilDate
  if (adjusted) {
    return {
      value: due,
      source: 'manual_override',
      replaced: { value: clock.computedDue as CivilDate, source: clock.source },
    }
  }
  return {
    value: due,
    source: clock.source,
    replaced:
      clock.source === 'town_setting' && clock.replacedDue !== null
        ? { value: clock.replacedDue as CivilDate, source: 'pack_rule' }
        : null,
  }
}

export function explainClock(
  clock: ClockRow,
  adjustments: AdjustmentRow[],
  rule: ClockRule,
  today: CivilDate,
): ClockExplanation {
  const live = adjustments.filter((a) => a.supersededBy === null)
  return {
    ruleLabel: rule.label,
    citation: rule.citation,
    ruleKey: clock.ruleKey,
    ruleVersion: clock.ruleVersion,
    packVersion: clock.packVersion,
    startEvent: START_EVENT_LABELS[clock.startEvent] ?? clock.startEvent,
    startDate: clock.startDate as CivilDate,
    countingMethod: clock.countingMethod,
    computedDue: clock.computedDue as CivilDate,
    currentDue: currentDueOf(
      clock,
      live.some((a) => a.newDue !== null),
    ),
    rolledFrom: clock.rolledFrom as CivilDate | null,
    adjustments: live.map((a) => ({
      kind: a.kind,
      days: a.days,
      newDue: a.newDue as CivilDate | null,
      reason: a.reason,
      legalAuthority: a.legalAuthority as { citation: string; explanation: string } | null,
      by: a.createdBy,
      at: a.createdAt,
    })),
    consequence: rule.consequence.text,
    consequenceKind: rule.consequence.kind,
    whose: rule.whose,
    extensionPolicy: extensionPolicyText(rule),
    allowedAdjustments: allowedAdjustmentKinds(rule),
    status: clock.status,
    metOn: clock.metOn as CivilDate | null,
    daysRemaining: daysBetween(today, clock.currentDue as CivilDate),
  }
}
