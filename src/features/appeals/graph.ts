import { type AppealNodeKind, type AppealRoute, NH_APPEAL_ROUTES } from '@packs/nh/appealRoutes'
import type { DecisionOutcome } from '@packs/nh/schema'
import { and, desc, eq, ne } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { appealNodes, clocks } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { recordAppeal } from '@/features/appeals/appeals'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { computeRuleDue } from '@/features/clocks/ruleEngine'
import { markClockMet, startClocksFor } from '@/features/clocks/startClocks'
import { packHolidayCalendar } from '@/features/packs/holidays'
import { loadPack, ruleByKey } from '@/features/packs/loadPack'
import { isAfterTownToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type AppealError =
  | 'forbidden'
  | 'not_found'
  | 'route_not_allowed'
  | 'not_issued'
  | 'wrong_outcome'
  | 'future_date'

export interface AddNodeInput {
  parentId: string
  kind: AppealNodeKind
  occurredOn: CivilDate
  applicationId?: string
  outcome?: string
  linkedComponent?: boolean
  appellantName?: string
}

type NodeRow = typeof appealNodes.$inferSelect

export async function recordDecisionNode(
  tx: Tx,
  input: {
    applicationId: string
    decisionId: string
    board: 'planning_board' | 'zba'
    outcome: DecisionOutcome
    occurredOn: CivilDate
    createdBy: string
  },
): Promise<void> {
  await tx.insert(appealNodes).values({
    kind: input.board === 'zba' ? 'zba_decision' : 'pb_decision',
    applicationId: input.applicationId,
    decisionId: input.decisionId,
    occurredOn: input.occurredOn,
    outcome: input.outcome,
    createdBy: input.createdBy,
  })
}

export async function addAdministrativeDecision(
  db: Db,
  actor: Actor,
  input: { applicationId: string; occurredOn: CivilDate },
  signal: AbortSignal,
): Promise<Result<{ nodeId: string }, AppealError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const app = await loadApplicationContext(db, input.applicationId, signal)
  if (app === null) return err('not_found')
  const [row] = await db
    .insert(appealNodes)
    .values({
      kind: 'administrative_decision',
      applicationId: input.applicationId,
      occurredOn: input.occurredOn,
      createdBy: actor.userId,
    })
    .returning({ id: appealNodes.id })
  return ok({ nodeId: row?.id ?? '' })
}

function chooseRoute(
  parent: NodeRow,
  input: AddNodeInput,
): Result<AppealRoute, 'route_not_allowed' | 'wrong_outcome'> {
  const candidates = NH_APPEAL_ROUTES.filter((r) => r.from === parent.kind && r.to === input.kind)
  if (parent.kind === 'rehearing_outcome') {
    const linked = parent.linkedPbNodeId !== null
    const wanted =
      parent.outcome === 'granted' ? 'granted' : linked ? 'denied on a linked component' : 'denied'
    const hit = candidates.find((r) => r.when === wanted)
    return hit === undefined ? err('route_not_allowed') : ok(hit)
  }
  if (parent.kind === 'pb_decision' && input.kind === 'zba_appeal') {
    const hit = input.linkedComponent === true ? candidates[0] : undefined
    return hit === undefined ? err('route_not_allowed') : ok(hit)
  }
  const hit = candidates.find((r) => r.when === undefined)
  return hit === undefined ? err('route_not_allowed') : ok(hit)
}

async function windowDue(
  tx: Tx,
  parent: NodeRow,
  applicationId: string | null,
  ruleKey: string,
): Promise<CivilDate> {
  if (applicationId !== null) {
    const [clock] = await tx
      .select({ currentDue: clocks.currentDue })
      .from(clocks)
      .where(
        and(
          eq(clocks.applicationId, applicationId),
          eq(clocks.ruleKey, ruleKey),
          eq(clocks.startDate, parent.occurredOn),
          ne(clocks.status, 'superseded'),
        ),
      )
      .orderBy(desc(clocks.createdAt))
      .limit(1)
    if (clock !== undefined) return clock.currentDue as CivilDate
  }
  const rule = ruleByKey(loadPack(), ruleKey)
  const length = rule.kind === 'clock' && 'value' in rule.length ? rule.length : null
  if (rule.kind !== 'clock' || length === null) return parent.occurredOn as CivilDate
  return computeRuleDue(
    rule,
    { unit: length.unit, value: length.value },
    parent.occurredOn as CivilDate,
    packHolidayCalendar(),
  ).due
}

function linkedNodeFor(parent: NodeRow, input: AddNodeInput): string | null {
  if (input.kind === 'zba_appeal' && parent.kind === 'pb_decision') return parent.id
  if (parent.kind === 'rehearing_outcome' && input.kind === 'court_petition') return null
  return parent.linkedPbNodeId
}

function statusFor(kind: AppealNodeKind, stayed: boolean): NodeRow['status'] {
  if (stayed) return 'stayed'
  return kind === 'rehearing_outcome' ? 'resolved' : 'open'
}

async function hasOpenLinkedComponent(tx: Tx, pbNodeId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: appealNodes.id })
    .from(appealNodes)
    .where(and(eq(appealNodes.linkedPbNodeId, pbNodeId), eq(appealNodes.status, 'open')))
    .limit(1)
  return rows.length > 0
}

async function startWindowClocks(
  tx: Tx,
  parent: NodeRow,
  input: AddNodeInput,
  applicationId: string | null,
  linked: boolean,
  signal: AbortSignal,
): Promise<void> {
  if (applicationId === null) return
  if (input.kind === 'rehearing_outcome') {
    const denied = input.outcome === 'denied'
    if (linked && !denied) return
    await startClocksFor(
      tx,
      applicationId,
      'rehearing_vote',
      input.occurredOn,
      signal,
      undefined,
      undefined,
      {
        outcome: denied ? 'rehearing_denied' : 'rehearing_granted',
      },
    )
    return
  }
  if (input.kind === 'zba_decision' && !linked && input.outcome !== undefined) {
    await startClocksFor(
      tx,
      applicationId,
      'board_vote',
      input.occurredOn,
      signal,
      undefined,
      undefined,
      {
        outcome: input.outcome as DecisionOutcome,
      },
    )
  }
  void parent
}

async function maybeSuspendIssuedPermit(
  db: Db,
  actor: Actor,
  parent: NodeRow,
  input: AddNodeInput,
  signal: AbortSignal,
): Promise<Result<void, AppealError>> {
  if (parent.kind !== 'administrative_decision' || input.kind !== 'zba_appeal') return ok(undefined)
  if (parent.applicationId === null) return ok(undefined)
  const app = await loadApplicationContext(db, parent.applicationId, signal)
  if (app?.state !== 'issued') return ok(undefined)
  const recorded = await recordAppeal(
    db,
    actor,
    {
      applicationId: parent.applicationId,
      filedOn: input.occurredOn,
      appellantName: input.appellantName ?? 'Appellant',
    },
    signal,
  )
  return recorded.ok ? ok(undefined) : err(recorded.error)
}

export async function addAppealNode(
  db: Db,
  actor: Actor,
  input: AddNodeInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ nodeId: string }, AppealError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  if (await isAfterTownToday(db, input.occurredOn, now, signal)) return err('future_date')
  const [parent] = await db.select().from(appealNodes).where(eq(appealNodes.id, input.parentId))
  if (parent === undefined) return err('not_found')
  const route = chooseRoute(parent, input)
  if (!route.ok) return route
  if (
    input.kind === 'rehearing_outcome' &&
    input.outcome !== 'denied' &&
    input.outcome !== 'granted'
  ) {
    return err('wrong_outcome')
  }
  const suspended = await maybeSuspendIssuedPermit(db, actor, parent, input, signal)
  if (!suspended.ok) return suspended
  return await transactionResult<{ nodeId: string }, AppealError>(db, async (tx) => {
    const clockApplicationId = parent.applicationId
    const applicationId = input.applicationId ?? parent.applicationId
    const linkedPbNodeId = linkedNodeFor(parent, input)
    const toPbDecision =
      input.kind === 'court_petition' &&
      parent.kind === 'rehearing_outcome' &&
      parent.linkedPbNodeId !== null
    let untimely = false
    if (route.value.windowRuleKey !== null) {
      const due = await windowDue(tx, parent, clockApplicationId, route.value.windowRuleKey)
      untimely = compareCivil(input.occurredOn, due) > 0
      if (clockApplicationId !== null) {
        await markClockMet(
          tx,
          clockApplicationId,
          route.value.windowRuleKey,
          input.occurredOn,
          signal,
        )
      }
    }
    const stayed =
      input.kind === 'court_petition' &&
      parent.kind === 'pb_decision' &&
      (await hasOpenLinkedComponent(tx, parent.id))
    const [row] = await tx
      .insert(appealNodes)
      .values({
        kind: input.kind,
        applicationId,
        parentId: toPbDecision ? parent.linkedPbNodeId : parent.id,
        linkedPbNodeId,
        occurredOn: input.occurredOn,
        outcome: input.outcome ?? null,
        status: statusFor(input.kind, stayed),
        untimely,
        createdBy: actor.userId,
      })
      .returning({ id: appealNodes.id })
    if (
      parent.kind === 'rehearing_motion' ||
      (parent.kind === 'zba_appeal' && input.kind === 'zba_decision')
    ) {
      await tx.update(appealNodes).set({ status: 'resolved' }).where(eq(appealNodes.id, parent.id))
    }
    await startWindowClocks(tx, parent, input, clockApplicationId, linkedPbNodeId !== null, signal)
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'appeal.node.add',
        entityType: 'appeal_node',
        entityId: row?.id ?? '',
        after: { kind: input.kind, parentId: parent.id, occurredOn: input.occurredOn, untimely },
      },
      signal,
    )
    return ok({ nodeId: row?.id ?? '' })
  })
}
