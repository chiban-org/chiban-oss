import { and, desc, eq, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { type appealNodes, clocks } from '@/db/schema'
import {
  applicationProjectFinality,
  isApprovingOutcome,
  PROJECT_FINAL_APPROVAL,
  type ProjectFinality,
  ruleWaitsForFinalApproval,
} from '@/features/appeals/projectFinality'
import { hasWindowLength, resolvedLength } from '@/features/clocks/resolvedLength'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { activePack } from '@/features/packs/registry'
import type { AppealNodeKind, AppealRoute, BoardKind } from '@/features/packs/schema'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

type NodeRow = typeof appealNodes.$inferSelect

interface RouteFacts {
  outcome: 'granted' | 'denied' | null
  linkedComponent: boolean
  finalReviewBoard: BoardKind | null
}

function routeSpecificity(when: AppealRoute['when']): number {
  if (when === undefined) return 0
  return (
    (when.outcome === undefined ? 0 : 1) +
    (when.linkedComponent === undefined ? 0 : 1) +
    (when.finalReviewBoard === undefined ? 0 : 1)
  )
}

function routeApplies(when: NonNullable<AppealRoute['when']>, facts: RouteFacts): boolean {
  if (when.outcome !== undefined && when.outcome !== facts.outcome) return false
  if (when.finalReviewBoard !== undefined && when.finalReviewBoard !== facts.finalReviewBoard)
    return false
  return when.linkedComponent === undefined || when.linkedComponent === facts.linkedComponent
}

function candidateRoutes(parent: NodeRow, kind: AppealNodeKind): AppealRoute[] {
  return activePack().appealRoutes.filter((r) => r.from === parent.kind && r.to === kind)
}

export function windowRoutesFrom(node: NodeRow): AppealRoute[] {
  return activePack().appealRoutes.filter((r) => r.from === node.kind && r.windowRuleKey !== null)
}

function dependsOnFinality(routes: AppealRoute[]): boolean {
  return routes.some(
    (r) =>
      r.when?.finalReviewBoard !== undefined ||
      (r.windowRuleKey !== null && ruleWaitsForFinalApproval(r.windowRuleKey)),
  )
}

export async function finalityForRoutes(
  db: DbOrTx,
  parent: NodeRow,
  routes: AppealRoute[],
  signal: AbortSignal,
): Promise<ProjectFinality | null> {
  if (parent.applicationId === null || !dependsOnFinality(routes)) return null
  return await applicationProjectFinality(db, parent.applicationId, signal)
}

export async function finalityForRoute(
  db: DbOrTx,
  parent: NodeRow,
  kind: AppealNodeKind,
  signal: AbortSignal,
): Promise<ProjectFinality | null> {
  return await finalityForRoutes(db, parent, candidateRoutes(parent, kind), signal)
}

const DECISION_PARENTS: readonly AppealNodeKind[] = [
  'zba_decision',
  'pb_decision',
  'administrative_decision',
]

function outcomeFact(parent: NodeRow): RouteFacts['outcome'] {
  if (parent.kind === 'rehearing_outcome')
    return parent.outcome === 'granted' ? 'granted' : 'denied'
  if (!DECISION_PARENTS.includes(parent.kind)) return null
  if (isApprovingOutcome(parent.outcome)) return 'granted'
  return parent.outcome === 'denied' ? 'denied' : null
}

export function routeFacts(
  parent: NodeRow,
  linkedComponent: boolean | undefined,
  finality: ProjectFinality | null,
): RouteFacts {
  const afterRehearing = parent.kind === 'rehearing_outcome'
  return {
    outcome: outcomeFact(parent),
    linkedComponent: afterRehearing ? parent.linkedPbNodeId !== null : linkedComponent === true,
    finalReviewBoard: finality?.finalReviewBoard ?? null,
  }
}

export function mostSpecificRoute(
  routes: AppealRoute[],
  facts: RouteFacts,
): AppealRoute | undefined {
  return routes
    .filter((r) => r.when === undefined || routeApplies(r.when, facts))
    .sort((a, b) => routeSpecificity(b.when) - routeSpecificity(a.when))[0]
}

export function chooseRoute(
  parent: NodeRow,
  input: { kind: AppealNodeKind; linkedComponent?: boolean },
  finality: ProjectFinality | null,
): Result<AppealRoute, 'route_not_allowed' | 'wrong_outcome'> {
  const hit = mostSpecificRoute(
    candidateRoutes(parent, input.kind),
    routeFacts(parent, input.linkedComponent, finality),
  )
  return hit === undefined ? err('route_not_allowed') : ok(hit)
}

export function waitsForFinality(
  parent: NodeRow,
  input: { kind: AppealNodeKind; occurredOn: CivilDate },
  route: AppealRoute,
  finality: ProjectFinality | null,
): boolean {
  const afterFinal =
    input.kind === 'court_petition' &&
    parent.applicationId !== null &&
    isApprovingOutcome(parent.outcome) &&
    route.windowRuleKey !== null &&
    ruleWaitsForFinalApproval(route.windowRuleKey)
  if (!afterFinal) return false
  return finality === null || compareCivil(input.occurredOn, finality.finalOn) < 0
}

export interface WindowClock {
  ruleKey: string
  startEvent: string
  startDate: string
  currentDue: string
}

export function clockedWindowDue(
  windowClocks: readonly WindowClock[],
  parent: NodeRow,
  ruleKey: string,
): CivilDate | null {
  const afterFinal = ruleWaitsForFinalApproval(ruleKey)
  const clock = windowClocks.find(
    (c) =>
      c.ruleKey === ruleKey &&
      (afterFinal ? c.startEvent === PROJECT_FINAL_APPROVAL : c.startDate === parent.occurredOn),
  )
  return clock === undefined ? null : (clock.currentDue as CivilDate)
}

export async function ruleWindowDue(
  db: DbOrTx,
  parent: NodeRow,
  ruleKey: string,
  finality: ProjectFinality | null,
  signal: AbortSignal,
): Promise<CivilDate> {
  const rule = ruleByKey(loadPack(), ruleKey)
  const startOn =
    ruleWaitsForFinalApproval(ruleKey) && finality !== null
      ? finality.finalOn
      : (parent.occurredOn as CivilDate)
  if (rule.kind !== 'clock' || !hasWindowLength(rule)) return parent.occurredOn as CivilDate
  return computeRuleDue(
    rule,
    await resolvedLength(db, rule, signal),
    startOn,
    packHolidayCalendar(),
  ).due
}

async function startedClockDue(
  tx: DbOrTx,
  applicationId: string,
  ruleKey: string,
  started: ReturnType<typeof eq>,
): Promise<CivilDate | null> {
  const [clock] = await tx
    .select({ currentDue: clocks.currentDue })
    .from(clocks)
    .where(
      and(
        eq(clocks.applicationId, applicationId),
        eq(clocks.ruleKey, ruleKey),
        started,
        ne(clocks.status, 'superseded'),
      ),
    )
    .orderBy(desc(clocks.createdAt))
    .limit(1)
  return clock === undefined ? null : (clock.currentDue as CivilDate)
}

export async function windowDue(
  tx: DbOrTx,
  parent: NodeRow,
  window: { applicationId: string | null; ruleKey: string; finality: ProjectFinality | null },
  signal: AbortSignal,
): Promise<CivilDate> {
  const { applicationId, ruleKey, finality } = window
  if (applicationId !== null) {
    const started = ruleWaitsForFinalApproval(ruleKey)
      ? eq(clocks.startEvent, PROJECT_FINAL_APPROVAL)
      : eq(clocks.startDate, parent.occurredOn)
    const due = await startedClockDue(tx, applicationId, ruleKey, started)
    if (due !== null) return due
  }
  return await ruleWindowDue(tx, parent, ruleKey, finality, signal)
}
