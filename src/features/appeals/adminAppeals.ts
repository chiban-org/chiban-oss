import { and, eq } from 'drizzle-orm'
import { JOB_NAMES } from '@/constants/jobNames'
import type { Db, Tx } from '@/db/client'
import { appealNodes, applications } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { applicationVisibleTo } from '@/features/access/predicates'
import type { AppealError } from '@/features/appeals/graph'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { DecisionOutcome } from '@/features/packs/schema'
import { isAfterTownToday } from '@/features/town/today'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export { loadAdministrativeAppeals, loadApplicationAppeals } from './adminAppealsView'

export type AdministrativeDecisionError = AppealError | 'unknown_application'

export interface RecordedDecision {
  nodeId: string
  applicationId: string
}

export async function addAdministrativeDecision(
  db: Db,
  actor: Actor,
  input: { applicationId: string; occurredOn: CivilDate; now?: Date },
  signal: AbortSignal,
): Promise<Result<{ nodeId: string }, AppealError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  if (await isAfterTownToday(db, input.occurredOn, input.now ?? new Date(), signal))
    return err('future_date')
  return await transactionResult<{ nodeId: string }, AppealError>(db, async (tx) => {
    const [app] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
    if (app === undefined) return err('not_found')
    return ok(
      await addAdministrativeDecisionTx(
        tx,
        { applicationId: app.id, occurredOn: input.occurredOn, createdBy: actor.userId },
        signal,
      ),
    )
  })
}

export async function addAdministrativeDecisionTx(
  tx: Tx,
  input: {
    applicationId: string
    occurredOn: CivilDate
    createdBy: string | null
    outcome?: DecisionOutcome
  },
  signal: AbortSignal,
): Promise<{ nodeId: string }> {
  const outcome = input.outcome === undefined ? {} : { outcome: input.outcome }
  const [row] = await tx
    .insert(appealNodes)
    .values({
      kind: 'administrative_decision',
      applicationId: input.applicationId,
      occurredOn: input.occurredOn,
      createdBy: input.createdBy,
      ...outcome,
    })
    .returning({ id: appealNodes.id })
  const nodeId = row?.id ?? ''
  await writeAudit(
    tx,
    {
      actor:
        input.createdBy === null
          ? { kind: 'system', job: JOB_NAMES.CLOCKS_DAILY }
          : { kind: 'user', userId: input.createdBy },
      action: 'appeal.node.add',
      entityType: 'appeal_node',
      entityId: nodeId,
      after: {
        kind: 'administrative_decision',
        applicationId: input.applicationId,
        occurredOn: input.occurredOn,
        ...outcome,
      },
    },
    signal,
  )
  return { nodeId }
}

export async function recordAdministrativeDecision(
  db: Db,
  actor: Actor,
  input: { applicationNumber: string; occurredOn: CivilDate; now?: Date },
  signal: AbortSignal,
): Promise<Result<RecordedDecision, AdministrativeDecisionError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const [app] = await db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(eq(applications.number, input.applicationNumber.trim()), applicationVisibleTo(actor)),
    )
  if (app === undefined) return err('unknown_application')
  const added = await addAdministrativeDecision(
    db,
    actor,
    {
      applicationId: app.id,
      occurredOn: input.occurredOn,
      ...(input.now === undefined ? {} : { now: input.now }),
    },
    signal,
  )
  return added.ok ? ok({ nodeId: added.value.nodeId, applicationId: app.id }) : added
}
