import { AppError, ErrorIds } from '@/constants/errorIds'
import { extensionPolicyText } from '@/features/clocks/explainClock'
import { onlyWhenConditions } from '@/features/clocks/ruleEngine'
import { OUTCOME_LABELS } from '@/features/decisions/labels'
import { activePack } from '@/features/packs/registry'
import type {
  ClockLength,
  ClockRule,
  DecisionOutcome,
  FactCondition,
  OnlyWhen,
  PackRule,
  StartEvent,
} from '@/features/packs/schema'
import { boardLabel, rehearingWords } from '@/features/packs/vocabulary'
import { formatCivilDateWithWeekday } from '@/lib/formatDate'
import { generatedFrontMatter } from '@/lib/generatedFrontMatter'
import { escapeText, joinBlocks, listInWords, table } from './markdown'

export function generatedDir(): string {
  return `docs-site/docs/state-packs/${activePack().docsSlug}/_generated`
}

export function clocksPath(): string {
  return `${generatedDir()}/clocks.md`
}

export function holidaysPath(): string {
  return `${generatedDir()}/holidays.md`
}

export function otherRulesPath(): string {
  return `${generatedDir()}/other-rules.md`
}

export const HOLIDAY_YEARS = [2026, 2027, 2028] as const

const START_EVENTS: Record<StartEvent, string> = {
  application_received: 'the application is received',
  application_completed: 'the application is complete',
  permit_issued: 'the permit is issued',
  regional_impact_notice_mailed: 'the regional impact notice is mailed',
  acceptance_meeting_set: 'the meeting',
  application_accepted: 'the board accepts the application as complete',
  hearing_held: 'the hearing is held',
  final_approval: 'final approval',
  final_written_approval: 'the final written approval is issued',
  board_vote: 'the board votes',
  decision_filed: 'the decision is filed',
  get rehearing_vote() {
    return `the board votes on the ${rehearingWords().noun}`
  },
  project_final_approval: 'the project has its final municipal approval',
  administrative_decision: 'the administrative decision',
  order_served: 'the order is served',
  cure_notice_sent: 'the cure notice is sent',
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
    case 'significantDecision':
      return fact.is
        ? 'the decision is a significant land use decision'
        : 'the decision is not a significant land use decision'
    case 'finalReviewBoard':
      return `the ${listInWords(fact.in.map(boardLabel), 'or')} gives the last municipal approval`
  }
}

function onlyWhenText(onlyWhen: OnlyWhen): string {
  return listInWords(onlyWhenConditions(onlyWhen).map(factText), 'and')
}

function amount(value: number, unit: 'days' | 'months' | 'business_days'): string {
  const word = unit === 'business_days' ? 'business day' : unit === 'days' ? 'day' : 'month'
  return `${value} ${word}${value === 1 ? '' : 's'}`
}

function townSettingDefault(key: string): string {
  const setting = activePack().manifest.rules.find((rule) => rule.key === key)
  if (setting?.kind !== 'town_setting') {
    throw new AppError(ErrorIds.PACK_INVALID, 'clock length names a missing town setting', { key })
  }
  const policy = setting.overridePolicy
  const name = `The town’s ${setting.label.charAt(0).toLowerCase()}${setting.label.slice(1)}`
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
    const board = boardLabel(length.earlierOfNextRegularMeeting.boardKind)
    return `${amount(length.value, length.unit)} ${anchor}, or the next regular ${board} meeting that notice can still be given for, whichever comes first.`
  }
  return `${amount(length.value, length.unit)} ${anchor}.`
}

function countingText(rule: ClockRule): string {
  const { length } = rule
  if (length.unit === 'stated_date') return ''
  if (length.unit === 'business_days') {
    return `Business days: the start day is not counted, and Saturdays, Sundays and legal holidays are skipped (${activePack().countingCitations.businessDayRoll}).`
  }
  const base = `Calendar ${length.unit}: the start day is not counted and the last day is (${activePack().countingCitations.dayCounting}).`
  if (rule.clockType === 'filing_window' && rule.direction === 'after') {
    return `${base} A last day that falls on a Saturday, Sunday or legal holiday moves to the next business day (${activePack().countingCitations.businessDayRoll}).`
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
    rule.onlyWhen === undefined ? '' : `- **Applies only when** ${onlyWhenText(rule.onlyWhen)}.`,
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
  const grouped = new Set(
    activePack().ruleAreas.flatMap((group) => group.rules.map((rule) => rule.key)),
  )
  const missing = activePack().manifest.rules.filter((rule) => !grouped.has(rule.key))
  if (missing.length > 0) {
    throw new AppError(ErrorIds.PACK_INVALID, 'rules missing from the deadline groups', {
      keys: missing.map((r) => r.key),
    })
  }
}

function packSources(): string[] {
  const root = `packs/${activePack().manifest.id}`
  return [
    `${root}/manifest.ts`,
    `${root}/rules`,
    `${root}/countingCitations.ts`,
    'src/features/clocks/explainClock.ts',
  ]
}

export function renderClocks(): string {
  assertGroupsCoverManifest()
  const sections = activePack().ruleAreas.map((group) => {
    const clocks = group.rules.filter(isClock)
    return clocks.length === 0
      ? ''
      : joinBlocks([`## ${group.title}`, ...clocks.map(clockBlock)]).trimEnd()
  })
  return `${generatedFrontMatter({ sources: packSources() })}${joinBlocks(sections)}`
}

export function renderOtherRules(): string {
  assertGroupsCoverManifest()
  const rows = activePack().ruleAreas.flatMap((group) =>
    group.rules
      .filter((rule) => !isClock(rule))
      .map((rule) => [group.title, escapeText(rule.label), citation(rule)]),
  )
  return `${generatedFrontMatter({ sources: packSources() })}${joinBlocks([
    table(['Area', 'Rule', 'Source'], rows),
  ])}`
}

export function renderHolidays(): string {
  const rows = HOLIDAY_YEARS.flatMap((year) =>
    [...activePack().holidays(year)]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((holiday) => [
        formatCivilDateWithWeekday(holiday.date),
        escapeText(holiday.name),
        holiday.citation,
      ]),
  )
  return `${generatedFrontMatter({
    sources: [`packs/${activePack().manifest.id}/holidays.ts`],
  })}${joinBlocks([table(['Date', 'Holiday', 'Source'], rows)])}`
}
