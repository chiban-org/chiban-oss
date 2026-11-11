import type { BoardKind } from '@packs/nh/boardSchema'
import { NH_COUNTING_CITATIONS } from '@packs/nh/countingCitations'
import { nhLegalHolidays } from '@packs/nh/holidays'
import { NH_PACK_MANIFEST } from '@packs/nh/manifest'
import { APPEAL_RULES } from '@packs/nh/rules/appeals'
import { BUILDING_RULES } from '@packs/nh/rules/building'
import { CODE_RULES } from '@packs/nh/rules/code'
import { DECISION_RULES } from '@packs/nh/rules/decisions'
import { ENFORCEMENT_RULES } from '@packs/nh/rules/enforcement'
import { LOCAL_PERMIT_RULES } from '@packs/nh/rules/localPermits'
import { NOTICE_REQUIREMENT_RULES } from '@packs/nh/rules/noticeRequirements'
import { PLANNING_BOARD_RULES } from '@packs/nh/rules/planningBoard'
import { REGIONAL_IMPACT_BOARD_RULES } from '@packs/nh/rules/regionalImpact'
import { RTK_RULES } from '@packs/nh/rules/rightToKnow'
import { ZBA_RULES } from '@packs/nh/rules/zba'
import type {
  ClockLength,
  ClockRule,
  DecisionOutcome,
  FactCondition,
  PackRule,
  StartEvent,
} from '@packs/nh/schema'
import { AppError, ErrorIds } from '@/constants/errorIds'
import { extensionPolicyText } from '@/features/clocks/explainClock'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { formatCivilDateWithWeekday } from '@/lib/formatDate'
import { generatedFrontMatter } from '@/lib/generatedFrontMatter'
import { escapeText, joinBlocks, listInWords, table } from './markdown'

const DIR = 'docs-site/docs/state-packs/new-hampshire/_generated'
export const CLOCKS_PATH = `${DIR}/clocks.md`
export const HOLIDAYS_PATH = `${DIR}/holidays.md`
export const OTHER_RULES_PATH = `${DIR}/other-rules.md`

export const HOLIDAY_YEARS = [2026, 2027, 2028] as const

const RULE_GROUPS: readonly { title: string; rules: readonly PackRule[] }[] = [
  { title: 'Building permits', rules: BUILDING_RULES },
  { title: 'Building code', rules: CODE_RULES },
  { title: 'Planning Board', rules: PLANNING_BOARD_RULES },
  { title: 'Zoning Board of Adjustment', rules: ZBA_RULES },
  { title: 'Regional impact', rules: REGIONAL_IMPACT_BOARD_RULES },
  { title: 'Board decisions', rules: DECISION_RULES },
  { title: 'Notices', rules: NOTICE_REQUIREMENT_RULES },
  { title: 'Appeals', rules: APPEAL_RULES },
  { title: 'Local permits and registrations', rules: LOCAL_PERMIT_RULES },
  { title: 'Enforcement', rules: ENFORCEMENT_RULES },
  { title: 'Right-to-Know requests', rules: RTK_RULES },
]

const START_EVENTS: Record<StartEvent, string> = {
  application_received: 'the application is received',
  application_completed: 'the application is complete',
  permit_issued: 'the permit is issued',
  regional_impact_notice_mailed: 'the regional impact notice is mailed',
  acceptance_meeting_set: 'the meeting',
  application_accepted: 'the board accepts the application as complete',
  final_approval: 'final approval',
  board_vote: 'the board votes',
  decision_filed: 'the decision is filed',
  rehearing_vote: 'the board votes on the rehearing',
  administrative_decision: 'the administrative decision',
  order_served: 'the order is served',
  judgment_entered: 'the court enters judgment',
  rtk_request_received: 'the request is received',
  rtk_time_statement: 'the town states the time it needs',
}

const WHOSE: Record<ClockRule['whose'], string> = {
  official: 'Town staff',
  board: 'The board',
  applicant: 'The applicant',
  third_party: 'Someone outside the town office',
}

function outcomeText(outcome: DecisionOutcome): string {
  return OUTCOME_LABELS[outcome].toLowerCase()
}

const BOARDS: ReadonlyMap<BoardKind, string> = new Map([
  ['planning_board', 'Planning Board'],
  ['zba', 'Zoning Board of Adjustment'],
])

function factText(fact: FactCondition): string {
  switch (fact.fact) {
    case 'classification':
      return `the work is ${listInWords([...fact.in], 'or')}`
    case 'dwellingUnits':
      return `there are more than ${fact.gt} dwelling units`
    case 'regionalImpact':
      return 'the board finds regional impact'
    case 'decisionFiledLate':
      return 'the decision was filed late'
    case 'outcome':
      return `the outcome is ${listInWords(fact.in.map(outcomeText), 'or')}`
  }
}

function amount(value: number, unit: 'days' | 'months' | 'business_days'): string {
  const word = unit === 'business_days' ? 'business day' : unit === 'days' ? 'day' : 'month'
  return `${value} ${word}${value === 1 ? '' : 's'}`
}

function townSettingDefault(key: string): string {
  const setting = NH_PACK_MANIFEST.rules.find((rule) => rule.key === key)
  if (setting?.kind !== 'town_setting') {
    throw new AppError(ErrorIds.PACK_INVALID, 'clock length names a missing town setting', { key })
  }
  const policy = setting.overridePolicy
  const name = `The town’s ${setting.label.toLowerCase()}`
  if (policy.policy !== 'delegated_choice') return name
  return `${name}, ${amount(policy.default, setting.unit)} unless the town changes it`
}

function lengthText(rule: ClockRule): string {
  const length: ClockLength = rule.length
  const anchor = `${rule.direction} ${START_EVENTS[rule.startEvent]}`
  if (length.unit === 'stated_date') return 'The date the town gave in its written statement.'
  if ('fromSetting' in length) return `${townSettingDefault(length.fromSetting)}, ${anchor}.`
  if ('cases' in length) {
    const cases = length.cases.map((c) => `${amount(c.value, 'days')} when ${factText(c.when)}`)
    return `${amount(length.otherwise, 'days')} ${anchor}; ${cases.join('; ')}.`
  }
  if ('earlierOfNextRegularMeeting' in length) {
    const board = BOARDS.get(length.earlierOfNextRegularMeeting.boardKind) ?? 'board'
    return `${amount(length.value, length.unit)} ${anchor}, or the next regular ${board} meeting that notice can still be given for, whichever comes first.`
  }
  return `${amount(length.value, length.unit)} ${anchor}.`
}

function countingText(rule: ClockRule): string {
  const { length } = rule
  if (length.unit === 'stated_date') return ''
  if (length.unit === 'business_days') {
    return `Business days: the start day is not counted, and Saturdays, Sundays and legal holidays are skipped (${NH_COUNTING_CITATIONS.businessDayRoll}).`
  }
  const base = `Calendar ${length.unit}: the start day is not counted and the last day is (${NH_COUNTING_CITATIONS.dayCounting}).`
  if (rule.clockType === 'filing_window' && rule.direction === 'after') {
    return `${base} A last day that falls on a Saturday, Sunday or legal holiday moves to the next business day (${NH_COUNTING_CITATIONS.businessDayRoll}).`
  }
  if (rule.clockType === 'action_due') return `${base} It does not move for weekends or holidays.`
  return base
}

function citation(rule: PackRule): string {
  const label = escapeText(rule.citation.label)
  return rule.citation.url === null ? label : `[${label}](${rule.citation.url})`
}

function clockBlock(rule: ClockRule): string {
  const counting = countingText(rule)
  const lines = [
    `- **How long:** ${escapeText(lengthText(rule))}`,
    rule.onlyWhen === undefined ? '' : `- **Applies only when** ${factText(rule.onlyWhen)}.`,
    `- **Who acts:** ${WHOSE[rule.whose]}.`,
    counting === '' ? '' : `- **Counting:** ${counting}`,
    `- **If it is missed:** ${escapeText(rule.consequence.text)}`,
    `- **Extension:** ${escapeText(extensionPolicyText(rule))}`,
    `- **Source:** ${citation(rule)}`,
  ].filter((line) => line !== '')
  return joinBlocks([`### ${escapeText(rule.label)}`, lines.join('\n')]).trimEnd()
}

function isClock(rule: PackRule): rule is ClockRule {
  return rule.kind === 'clock'
}

function assertGroupsCoverManifest(): void {
  const grouped = new Set(RULE_GROUPS.flatMap((group) => group.rules.map((rule) => rule.key)))
  const missing = NH_PACK_MANIFEST.rules.filter((rule) => !grouped.has(rule.key))
  if (missing.length > 0) {
    throw new AppError(ErrorIds.PACK_INVALID, 'rules missing from the deadline groups', {
      keys: missing.map((r) => r.key),
    })
  }
}

const SOURCES = [
  'packs/nh/manifest.ts',
  'packs/nh/rules',
  'packs/nh/countingCitations.ts',
  'src/features/clocks/explainClock.ts',
]

export function renderClocks(): string {
  assertGroupsCoverManifest()
  const sections = RULE_GROUPS.map((group) => {
    const clocks = group.rules.filter(isClock)
    return clocks.length === 0
      ? ''
      : joinBlocks([`## ${group.title}`, ...clocks.map(clockBlock)]).trimEnd()
  })
  return `${generatedFrontMatter({ sources: SOURCES })}${joinBlocks(sections)}`
}

export function renderOtherRules(): string {
  assertGroupsCoverManifest()
  const rows = RULE_GROUPS.flatMap((group) =>
    group.rules
      .filter((rule) => !isClock(rule))
      .map((rule) => [group.title, escapeText(rule.label), citation(rule)]),
  )
  return `${generatedFrontMatter({ sources: SOURCES })}${joinBlocks([
    table(['Area', 'Rule', 'Source'], rows),
  ])}`
}

export function renderHolidays(): string {
  const rows = HOLIDAY_YEARS.flatMap((year) =>
    [...nhLegalHolidays(year)]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((holiday) => [
        formatCivilDateWithWeekday(holiday.date),
        escapeText(holiday.name),
        holiday.citation,
      ]),
  )
  return `${generatedFrontMatter({
    sources: ['packs/nh/holidays.ts'],
  })}${joinBlocks([table(['Date', 'Holiday', 'Source'], rows)])}`
}
