import { and, eq } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import { appealNodes } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { acceptsIssuanceAppeal, recordAppealAuthorizedByCaller } from '@/features/appeals/appeals'
import { declareFinalApproval } from '@/features/appeals/projectFinality'
import {
  chooseRoute,
  finalityForRoute,
  waitsForFinality,
  windowDue,
} from '@/features/appeals/routeWindow'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { markClockMet, startClocksFor } from '@/features/clocks/startClocks'
import { planAppealDecisionDelivery } from '@/features/decisions/appealDelivery'
import type { AppealNodeKind, BoardKind, DecisionOutcome } from '@/features/packs/schema'
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
  | 'before_parent'
  | 'duplicate_step'
  | 'not_final'
  | 'already_final'
  | 'before_reinstatement'
  | 'filed_during_hold'

export interface AddNodeInput {
  parentId: string
  kind: AppealNodeKind
  occurredOn: CivilDate
  applicationId?: string
  outcome?: string
  linkedComponent?: boolean
  appellantName?: string
  finalMunicipalApproval?: boolean
}

type NodeRow = typeof appealNodes.$inferSelect

export async function recordDecisionNode(
  tx: Tx,
  input: {
    applicationId: string
    decisionId: string
    boardKind: BoardKind
    outcome: DecisionOutcome
    occurredOn: CivilDate
    createdBy: string
  },
): Promise<void> {
  await tx.insert(appealNodes).values({
    kind: input.boardKind === 'zba' ? 'zba_decision' : 'pb_decision',
    applicationId: input.applicationId,
    decisionId: input.decisionId,
    occurredOn: input.occurredOn,
    outcome: input.outcome,
    createdBy: input.createdBy,
  })
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
  tx: Tx,
  actor: Actor,
  parent: NodeRow,
  input: AddNodeInput,
  signal: AbortSignal,
): Promise<Result<void, AppealError>> {
  if (parent.kind !== 'administrative_decision' || input.kind !== 'zba_appeal') return ok(undefined)
  if (parent.applicationId === null) return ok(undefined)
  const app = await loadApplicationContext(tx, parent.applicationId, signal)
  if (app === null || !(await acceptsIssuanceAppeal(tx, app, signal))) return ok(undefined)
  return await recordAppealAuthorizedByCaller(
    tx,
    actor,
    {
      applicationId: parent.applicationId,
      filedOn: input.occurredOn,
      appellantName: input.appellantName ?? 'Appellant',
    },
    signal,
  )
}

async function finishAppealDecision(
  tx: Tx,
  node: {
    actor: Actor
    nodeId: string | undefined
    applicationId: string | null
    linked: boolean
    input: AddNodeInput
  },
  signal: AbortSignal,
): Promise<Result<void, AppealError>> {
  const { input } = node
  if (input.kind !== 'zba_decision' || node.nodeId === undefined) return ok(undefined)
  await planAppealDecisionDelivery(tx, node.nodeId, node.linked, input, signal)
  return await declareFinalApproval(
    tx,
    {
      declared: input.finalMunicipalApproval,
      applicationId: node.applicationId,
      outcome: input.outcome ?? null,
      votedOn: input.occurredOn,
      boardKind: 'zba',
      actorUserId: node.actor.userId,
      decisionId: null,
      appealNodeId: node.nodeId,
    },
    signal,
  )
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
  const finality = await finalityForRoute(db, parent, input.kind, signal)
  const route = await chooseRoute(db, parent, { ...input, finality }, signal)
  if (!route.ok) return route
  if (waitsForFinality(parent, input, route.value, finality)) return err('not_final')
  if (compareCivil(input.occurredOn, parent.occurredOn as CivilDate) < 0)
    return err('before_parent')
  if (
    input.kind === 'rehearing_outcome' &&
    input.outcome !== 'denied' &&
    input.outcome !== 'granted'
  ) {
    return err('wrong_outcome')
  }
  return await transactionResult<{ nodeId: string }, AppealError>(db, async (tx) => {
    const suspended = await maybeSuspendIssuedPermit(tx, actor, parent, input, signal)
    if (!suspended.ok) return suspended
    const clockApplicationId = parent.applicationId
    const applicationId = input.applicationId ?? parent.applicationId
    const linkedPbNodeId = linkedNodeFor(parent, input)
    const toPbDecision =
      input.kind === 'court_petition' &&
      parent.kind === 'rehearing_outcome' &&
      parent.linkedPbNodeId !== null
    const followedId = toPbDecision ? parent.linkedPbNodeId : parent.id
    if (input.kind === 'court_petition' && followedId !== null) {
      const [existing] = await tx
        .select({ id: appealNodes.id })
        .from(appealNodes)
        .where(and(eq(appealNodes.parentId, followedId), eq(appealNodes.kind, 'court_petition')))
        .limit(1)
      if (existing !== undefined) return err('duplicate_step')
    }
    let untimely = false
    if (route.value.windowRuleKey !== null) {
      const due = await windowDue(
        tx,
        parent,
        {
          applicationId: clockApplicationId,
          ruleKey: route.value.windowRuleKey,
          finality,
        },
        signal,
      )
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
        parentId: followedId,
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
    const finished = await finishAppealDecision(
      tx,
      { actor, nodeId: row?.id, applicationId, linked: linkedPbNodeId !== null, input },
      signal,
    )
    if (!finished.ok) return finished
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
