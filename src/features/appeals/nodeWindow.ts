import type { GraphNode } from '@/components/appeals/AppealGraph'
import type { DbOrTx } from '@/db/client'
import type { appealNodes } from '@/db/schema'
import { isApprovingOutcome, ruleWaitsForFinalApproval } from '@/features/appeals/projectFinality'
import {
  finalityForRoutes,
  mostSpecificRoute,
  routeFacts,
  windowDue,
  windowRoutesFrom,
} from '@/features/appeals/routeWindow'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { AppealNodeKind } from '@/features/packs/schema'
import { formatCivilDate } from '@/lib/formatDate'
import type { CivilDate } from '@/types/civilDate'

type NodeRow = typeof appealNodes.$inferSelect

const DECISION_KINDS: readonly AppealNodeKind[] = [
  'zba_decision',
  'pb_decision',
  'administrative_decision',
]

export const AWAITING_FINAL_APPROVAL = 'after the project has its last municipal approval'

async function dueText(
  db: DbOrTx,
  node: NodeRow,
  ruleKey: string,
  finality: Awaited<ReturnType<typeof finalityForRoutes>>,
): Promise<string> {
  if (node.applicationId !== null && finality === null && isApprovingOutcome(node.outcome))
    return AWAITING_FINAL_APPROVAL
  const due = await windowDue(db, node, { applicationId: node.applicationId, ruleKey, finality })
  return formatCivilDate(due)
}

export async function nodeWindow(
  db: DbOrTx,
  node: NodeRow,
  signal: AbortSignal,
): Promise<GraphNode['window']> {
  const routes = windowRoutesFrom(node)
  const finality = await finalityForRoutes(db, node, routes, signal)
  const route = DECISION_KINDS.includes(node.kind)
    ? mostSpecificRoute(routes, routeFacts(node, false, finality))
    : routes[0]
  if (route === undefined || route.windowRuleKey === null) return null
  const rule = ruleByKey(loadPack(), route.windowRuleKey)
  if (rule.kind !== 'clock' || !('value' in rule.length)) return null
  const text = ruleWaitsForFinalApproval(rule.key)
    ? await dueText(db, node, rule.key, finality)
    : formatCivilDate(
        computeRuleDue(
          rule,
          { unit: rule.length.unit, value: rule.length.value },
          node.occurredOn as CivilDate,
          packHolidayCalendar(),
        ).due,
      )
  return { label: rule.label, dueText: text, consequence: rule.consequence.text }
}
