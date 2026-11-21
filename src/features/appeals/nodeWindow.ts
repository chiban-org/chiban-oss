import type { GraphNode } from '@/components/appeals/AppealGraph'
import type { DbOrTx } from '@/db/client'
import type { GraphNodeRow } from '@/features/appeals/graphNodeRows'
import { isApprovingOutcome, ruleWaitsForFinalApproval } from '@/features/appeals/projectFinality'
import { significanceForRoutes, usesSignificance } from '@/features/appeals/routeSignificance'
import {
  clockedWindowDue,
  finalityForRoutes,
  mostSpecificRoute,
  routeFacts,
  ruleWindowDue,
  windowRoutesFrom,
} from '@/features/appeals/routeWindow'
import { AWAITING_DECISION_FILED, AWAITING_FINAL_APPROVAL } from '@/features/appeals/windowStart'
import { hasWindowLength } from '@/features/clocks/resolvedLength'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import type { AppealNodeKind } from '@/features/packs/schema'
import { formatCivilDate } from '@/lib/formatDate'

const DECISION_KINDS: readonly AppealNodeKind[] = [
  'zba_decision',
  'pb_decision',
  'administrative_decision',
]

async function dueText(
  db: DbOrTx,
  node: GraphNodeRow,
  ruleKey: string,
  finality: Awaited<ReturnType<typeof finalityForRoutes>>,
  signal: AbortSignal,
): Promise<string> {
  const waiting =
    ruleWaitsForFinalApproval(ruleKey) &&
    node.applicationId !== null &&
    finality === null &&
    isApprovingOutcome(node.outcome)
  if (waiting) return AWAITING_FINAL_APPROVAL
  const clocked =
    node.applicationId === null ? null : clockedWindowDue(node.windowClocks ?? [], node, ruleKey)
  const rule = ruleByKey(loadPack(), ruleKey)
  const unfiled =
    node.applicationId !== null &&
    clocked === null &&
    rule.kind === 'clock' &&
    rule.startEvent === 'decision_filed'
  if (unfiled) return AWAITING_DECISION_FILED
  return formatCivilDate(clocked ?? (await ruleWindowDue(db, node, ruleKey, finality, signal)))
}

export async function nodeWindow(
  db: DbOrTx,
  node: GraphNodeRow,
  signal: AbortSignal,
): Promise<GraphNode['window']> {
  const routes = windowRoutesFrom(node)
  const finality = await finalityForRoutes(db, node, routes, signal)
  const significant = usesSignificance(routes)
    ? await significanceForRoutes(db, node, routes, signal)
    : null
  const bySpecificity =
    DECISION_KINDS.includes(node.kind) ||
    (node.kind === 'rehearing_outcome' && (significant !== null || finality !== null))
  const route = bySpecificity
    ? mostSpecificRoute(routes, routeFacts(node, false, finality, significant))
    : routes[0]
  if (route === undefined || route.windowRuleKey === null) return null
  const rule = ruleByKey(loadPack(), route.windowRuleKey)
  if (rule.kind !== 'clock' || !hasWindowLength(rule)) return null
  return {
    label: rule.label,
    dueText: await dueText(db, node, rule.key, finality, signal),
    consequence: rule.consequence.text,
  }
}
