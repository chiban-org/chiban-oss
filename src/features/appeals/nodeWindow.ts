import type { GraphNode } from '@/components/appeals/AppealGraph'
import type { DbOrTx } from '@/db/client'
import type { GraphNodeRow } from '@/features/appeals/graphNodeRows'
import { isApprovingOutcome, ruleWaitsForFinalApproval } from '@/features/appeals/projectFinality'
import {
  clockedWindowDue,
  finalityForRoutes,
  mostSpecificRoute,
  routeFacts,
  ruleWindowDue,
  windowRoutesFrom,
} from '@/features/appeals/routeWindow'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { AppealNodeKind } from '@/features/packs/schema'
import { formatCivilDate } from '@/lib/formatDate'

const DECISION_KINDS: readonly AppealNodeKind[] = [
  'zba_decision',
  'pb_decision',
  'administrative_decision',
]

export const AWAITING_FINAL_APPROVAL = 'after the project has its last municipal approval'

function dueText(
  node: GraphNodeRow,
  ruleKey: string,
  finality: Awaited<ReturnType<typeof finalityForRoutes>>,
): string {
  const waiting =
    ruleWaitsForFinalApproval(ruleKey) &&
    node.applicationId !== null &&
    finality === null &&
    isApprovingOutcome(node.outcome)
  if (waiting) return AWAITING_FINAL_APPROVAL
  const clocked =
    node.applicationId === null ? null : clockedWindowDue(node.windowClocks ?? [], node, ruleKey)
  return formatCivilDate(clocked ?? ruleWindowDue(node, ruleKey, finality))
}

export async function nodeWindow(
  db: DbOrTx,
  node: GraphNodeRow,
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
  return {
    label: rule.label,
    dueText: dueText(node, rule.key, finality),
    consequence: rule.consequence.text,
  }
}
