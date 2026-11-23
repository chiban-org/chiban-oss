import type { DbOrTx } from '@/db/client'
import { isApprovingOutcome } from '@/features/appeals/projectFinality'
import { waitingText } from '@/features/appeals/windowStart'
import { type LengthOf, resolvedLength } from '@/features/clocks/resolvedLength'
import { resolveRuleLength } from '@/features/clocks/ruleEngine'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { activePack } from '@/features/packs/registry'
import type {
  AppealNodeKind,
  AppealRoute,
  BoardKind,
  ClockRule,
  DecisionOutcome,
  ProceedingClassification,
  StartEvent,
} from '@/features/packs/schema'

export function appealRightsOf(classification: Pick<ProceedingClassification, 'appealRights'>) {
  return classification.appealRights
}

export function appealRightsFor(classificationKey: string): string {
  const found = loadPack().classifications.find((c) => c.key === classificationKey)
  return found === undefined ? '' : appealRightsOf(found)
}

type Side = 'granted' | 'denied'

interface KnownFacts {
  outcome: Side | null
  significant: boolean | null
  originalOutcome: Side | null
}

type Fit = 'no' | 'known' | 'conditional'

interface StatedRoute {
  route: AppealRoute
  conditional: boolean
}

const NO_FACTS: ProjectFacts = { classification: null, dwellingUnits: null, afterTheFact: false }

const START_PHRASES: ReadonlyMap<StartEvent, string> = new Map([
  ['board_vote', 'after the vote'],
  ['rehearing_vote', 'after the decision on reconsideration'],
  ['administrative_decision', 'after the decision'],
])

const UNIT_WORDS: ReadonlyMap<LengthOf['unit'], readonly [string, string]> = new Map([
  ['days', ['day', 'days']],
  ['months', ['month', 'months']],
  ['business_days', ['business day', 'business days']],
])

function sideOf(outcome: DecisionOutcome | null): Side | null {
  if (isApprovingOutcome(outcome)) return 'granted'
  return outcome === 'denied' ? 'denied' : null
}

function compare<T>(wanted: T | undefined, known: T | null): Fit {
  if (wanted === undefined) return 'known'
  if (known === null) return 'conditional'
  return wanted === known ? 'known' : 'no'
}

function fitOf(when: AppealRoute['when'], facts: KnownFacts): Fit {
  if (when === undefined) return 'known'
  const fits: Fit[] = [
    compare(when.outcome, facts.outcome),
    compare(when.significant, facts.significant),
    compare(when.originalOutcome, facts.originalOutcome),
    compare(when.finalReviewBoard, null),
    compare(when.linkedComponent, null),
  ]
  if (fits.includes('no')) return 'no'
  return fits.includes('conditional') ? 'conditional' : 'known'
}

function specificity(when: AppealRoute['when']): number {
  if (when === undefined) return 0
  return [
    when.outcome,
    when.significant,
    when.originalOutcome,
    when.finalReviewBoard,
    when.linkedComponent,
  ].filter((v) => v !== undefined).length
}

function routesFrom(kind: AppealNodeKind, facts: KnownFacts): StatedRoute[] {
  const from = activePack().appealRoutes.filter((r) => r.from === kind)
  const fits = new Map(from.map((r) => [r, fitOf(r.when, facts)]))
  const best = new Map<AppealNodeKind, AppealRoute>()
  for (const route of from) {
    if (fits.get(route) !== 'known') continue
    const held = best.get(route.to)
    if (held === undefined || specificity(route.when) > specificity(held.when))
      best.set(route.to, route)
  }
  return from.flatMap((route): StatedRoute[] => {
    const fit = fits.get(route)
    if (fit === 'conditional') return [{ route, conditional: true }]
    return fit === 'known' && best.get(route.to) === route ? [{ route, conditional: false }] : []
  })
}

function clockRule(key: string | null): ClockRule | null {
  if (key === null) return null
  const rule = ruleByKey(loadPack(), key)
  return rule.kind === 'clock' ? rule : null
}

function packLength(rule: ClockRule): LengthOf {
  const settingKey = 'fromSetting' in rule.length ? rule.length.fromSetting : null
  const setting = settingKey === null ? null : ruleByKey(loadPack(), settingKey)
  const { unit, value } = resolveRuleLength(rule, NO_FACTS, setting, undefined)
  return { unit, value }
}

function lengthWords({ unit, value }: LengthOf): string {
  const [one, many] = UNIT_WORDS.get(unit) ?? ['day', 'days']
  return `${value} ${value === 1 ? one : many}`
}

function startPhrase(event: StartEvent): string {
  return waitingText(event) ?? START_PHRASES.get(event) ?? 'after the decision'
}

function sentenceOf(
  { route, conditional }: StatedRoute,
  lengths: ReadonlyMap<string, LengthOf>,
): string | null {
  const rule = clockRule(route.windowRuleKey)
  if (rule === null) return null
  const length = lengthWords(lengths.get(rule.key) ?? packLength(rule))
  const window = `within ${length} ${startPhrase(rule.startEvent)} (${rule.citation.label}).`
  return conditional && route.when !== undefined
    ? `If ${route.when.label}: ${rule.label}, ${window}`
    : `${rule.label}: ${window}`
}

function statedRoutes(
  decisionKind: AppealNodeKind,
  outcome: DecisionOutcome | null,
  significant: boolean | null,
): StatedRoute[] {
  const side = sideOf(outcome)
  const direct = routesFrom(decisionKind, { outcome: side, significant, originalOutcome: null })
  if (!direct.some(({ route }) => route.to === 'rehearing_motion')) return direct
  return [
    ...direct,
    ...routesFrom('rehearing_outcome', { outcome: null, significant: null, originalOutcome: side }),
  ]
}

export function appealRightsFromRoutes(
  decisionKind: AppealNodeKind,
  outcome: DecisionOutcome | null,
  significant: boolean | null,
  lengths: ReadonlyMap<string, LengthOf> = new Map(),
): string {
  return statedRoutes(decisionKind, outcome, significant)
    .map((stated) => sentenceOf(stated, lengths))
    .filter((s): s is string => s !== null)
    .join(' ')
}

export async function townAppealRightsFromRoutes(
  db: DbOrTx,
  decision: { kind: AppealNodeKind; outcome: DecisionOutcome | null; significant: boolean | null },
  signal: AbortSignal,
): Promise<string> {
  const lengths = new Map<string, LengthOf>()
  for (const { route } of statedRoutes(decision.kind, decision.outcome, decision.significant)) {
    const rule = clockRule(route.windowRuleKey)
    if (rule !== null && 'fromSetting' in rule.length)
      lengths.set(rule.key, await resolvedLength(db, rule, signal))
  }
  return appealRightsFromRoutes(decision.kind, decision.outcome, decision.significant, lengths)
}

export function decisionNodeKind(boardKind: BoardKind | null): AppealNodeKind {
  if (boardKind === null) return 'administrative_decision'
  return boardKind === 'zba' ? 'zba_decision' : 'pb_decision'
}

export async function appealRightsForDecision(
  db: DbOrTx,
  classificationKey: string,
  decision: { kind: AppealNodeKind; outcome: DecisionOutcome | null; significant: boolean | null },
  signal: AbortSignal,
): Promise<string> {
  const stated = appealRightsFor(classificationKey)
  return stated === '' ? await townAppealRightsFromRoutes(db, decision, signal) : stated
}
