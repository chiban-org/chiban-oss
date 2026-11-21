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
import { rulesForEvent } from '@/features/clocks/ruleEngine'
import { effectiveBindings } from '@/features/config/bindings'
import { loadPack } from '@/features/packs/loadPack'
import { packRoles } from '@/features/packs/roles'
import { inRuleGroup } from '@/features/packs/ruleGroups'
import type { StartEvent } from '@/features/packs/schema'

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

export async function pendingWindowLines(
  db: Db,
  decision: DecisionRow | undefined,
  signal: AbortSignal,
): Promise<string[]> {
  if (decision === undefined) return []
  const pack = loadPack()
  const shown = packRoles().ruleGroups.portalBoardDeadlines
  const events = await eventsStillToCome(db, decision, signal)
  if (events.length === 0) return []
  const app = await loadApplicationContext(db, decision.applicationId, signal)
  if (app === null) return []
  const started = await db
    .select({ ruleKey: clocks.ruleKey })
    .from(clocks)
    .where(and(eq(clocks.applicationId, decision.applicationId), ne(clocks.status, 'superseded')))
  const startedKeys = new Set(started.map((c) => c.ruleKey))
  const bound = new Set(effectiveBindings(app.typeBody, pack))
  const facts = {
    ...app.facts,
    outcome: decision.outcome,
    significantDecision: decision.significant === true,
  }
  return events.flatMap((event) =>
    rulesForEvent(pack.rules, event, bound, facts)
      .filter((r) => inRuleGroup(r.key, shown) && !startedKeys.has(r.key))
      .map((r) => `${r.label}, starts ${waitingText(event) ?? 'later'}.`),
  )
}
