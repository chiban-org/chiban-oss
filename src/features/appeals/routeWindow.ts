import { and, desc, eq, ne } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import { type appealNodes, clocks } from '@/db/schema'
import {
  applicationProjectFinality,
  isApprovingOutcome,
  PROJECT_FINAL_APPROVAL,
  type ProjectFinality,
  ruleWaitsForFinalApproval,
} from '@/features/appeals/projectFinality'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { activePack } from '@/features/packs/registry'
import type { AppealNodeKind, AppealRoute, BoardKind } from '@/features/packs/schema'
import type { CivilDate } from '@/types/civilDate'
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

export async function finalityForRoute(
  db: DbOrTx,
  parent: NodeRow,
  kind: AppealNodeKind,
  signal: AbortSignal,
): Promise<ProjectFinality | null> {
  if (parent.applicationId === null) return null
  const depends = candidateRoutes(parent, kind).some(
    (r) =>
      r.when?.finalReviewBoard !== undefined ||
      (r.windowRuleKey !== null && ruleWaitsForFinalApproval(r.windowRuleKey)),
  )
  if (!depends) return null
  return await applicationProjectFinality(db, parent.applicationId, signal)
}

export function chooseRoute(
  parent: NodeRow,
  input: { kind: AppealNodeKind; linkedComponent?: boolean },
  finality: ProjectFinality | null,
): Result<AppealRoute, 'route_not_allowed' | 'wrong_outcome'> {
  const afterRehearing = parent.kind === 'rehearing_outcome'
  const facts: RouteFacts = {
    outcome: afterRehearing
      ? parent.outcome === 'granted'
        ? ('granted' as const)
        : ('denied' as const)
      : null,
    linkedComponent: afterRehearing
      ? parent.linkedPbNodeId !== null
      : input.linkedComponent === true,
    finalReviewBoard: finality?.finalReviewBoard ?? null,
  }
  const hit = candidateRoutes(parent, input.kind)
    .filter((r) => r.when === undefined || routeApplies(r.when, facts))
    .sort((a, b) => routeSpecificity(b.when) - routeSpecificity(a.when))[0]
  return hit === undefined ? err('route_not_allowed') : ok(hit)
}

export function waitsForFinality(
  parent: NodeRow,
  kind: AppealNodeKind,
  route: AppealRoute,
  finality: ProjectFinality | null,
): boolean {
  return (
    kind === 'court_petition' &&
    finality === null &&
    isApprovingOutcome(parent.outcome) &&
    route.windowRuleKey !== null &&
    ruleWaitsForFinalApproval(route.windowRuleKey)
  )
}

async function startedClockDue(
  tx: Tx,
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
  tx: Tx,
  parent: NodeRow,
  window: { applicationId: string | null; ruleKey: string; finality: ProjectFinality | null },
): Promise<CivilDate> {
  const { applicationId, ruleKey, finality } = window
  const afterFinal = ruleWaitsForFinalApproval(ruleKey)
  if (applicationId !== null) {
    const started = afterFinal
      ? eq(clocks.startEvent, PROJECT_FINAL_APPROVAL)
      : eq(clocks.startDate, parent.occurredOn)
    const due = await startedClockDue(tx, applicationId, ruleKey, started)
    if (due !== null) return due
  }
  const rule = ruleByKey(loadPack(), ruleKey)
  const startOn =
    afterFinal && finality !== null ? finality.finalOn : (parent.occurredOn as CivilDate)
  const length = rule.kind === 'clock' && 'value' in rule.length ? rule.length : null
  if (rule.kind !== 'clock' || length === null) return parent.occurredOn as CivilDate
  return computeRuleDue(
    rule,
    { unit: length.unit, value: length.value },
    startOn,
    packHolidayCalendar(),
  ).due
}
