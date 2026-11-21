import { and, eq, ne } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type boardDecisions, clocks } from '@/db/schema'
import {
  applicationProjectFinality,
  isApprovingOutcome,
  PROJECT_FINAL_APPROVAL,
  packWaitsForFinalApproval,
} from '@/features/appeals/projectFinality'
import { waitingText } from '@/features/appeals/windowStart'
import { loadApplicationContext } from '@/features/applications/context'
import { factMatches, onlyWhenConditions, rulesForEvent } from '@/features/clocks/ruleEngine'
import { effectiveBindings } from '@/features/config/bindings'
import type { ProjectFacts } from '@/features/forms/validateSubmission'
import { loadPack } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'
import { inRuleGroup } from '@/features/packs/ruleGroups'
import type { ClockRule, StartEvent } from '@/features/packs/schema'

type DecisionRow = typeof boardDecisions.$inferSelect

const DECISION_FILED: StartEvent = 'decision_filed'

async function eventsStillToCome(
  db: Db,
  decision: DecisionRow,
  signal: AbortSignal,
): Promise<StartEvent[]> {
  const events: StartEvent[] = decision.filedOn === null ? [DECISION_FILED] : []
  if (isApprovingOutcome(decision.outcome) && packWaitsForFinalApproval()) {
    const finality = await applicationProjectFinality(db, decision.applicationId, signal)
    if (finality === null) events.push(PROJECT_FINAL_APPROVAL)
  }
  return events
}

const DECISION_FACTS: readonly string[] = [
  'outcome',
  'significantDecision',
  'decisionFiledLate',
  'finalReviewBoard',
]

function decisionFactsOf(decision: DecisionRow): ProjectFacts {
  return {
    classification: null,
    dwellingUnits: null,
    afterTheFact: false,
    outcome: decision.outcome,
    significantDecision: decision.significant === true,
  }
}

function couldStart(rule: ClockRule, facts: ProjectFacts): boolean {
  return onlyWhenConditions(rule.onlyWhen)
    .filter((c) => DECISION_FACTS.includes(c.fact))
    .every((c) => factMatches(c, facts))
}

function candidateRules(event: StartEvent, facts: ProjectFacts): ClockRule[] {
  const shown = packRoles().ruleGroups.portalBoardDeadlines
  return loadPack().rules.filter(
    (r): r is ClockRule =>
      r.kind === 'clock' &&
      r.startEvent === event &&
      inRuleGroup(r.key, shown) &&
      couldStart(r, facts),
  )
}

export async function pendingWindowLines(
  db: Db,
  decision: DecisionRow | undefined,
  signal: AbortSignal,
): Promise<string[]> {
  if (decision === undefined) return []
  const decisionFacts = decisionFactsOf(decision)
  const events = (await eventsStillToCome(db, decision, signal)).filter(
    (event) => candidateRules(event, decisionFacts).length > 0,
  )
  if (events.length === 0) return []
  const app = await loadApplicationContext(db, decision.applicationId, signal)
  if (app === null) return []
  const started = await db
    .select({ ruleKey: clocks.ruleKey })
    .from(clocks)
    .where(and(eq(clocks.applicationId, decision.applicationId), ne(clocks.status, 'superseded')))
  const startedKeys = new Set(started.map((c) => c.ruleKey))
  const bound = new Set(effectiveBindings(app.typeBody, loadPack()))
  const facts: ProjectFacts = {
    ...app.facts,
    outcome: decisionFacts.outcome,
    significantDecision: decisionFacts.significantDecision,
  }
  return events.flatMap((event) =>
    rulesForEvent(candidateRules(event, decisionFacts), event, bound, facts)
      .filter((r) => !startedKeys.has(r.key))
      .map((r) => `${r.label}, starts ${waitingText(event) ?? 'later'}.`),
  )
}
