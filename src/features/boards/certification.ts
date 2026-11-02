import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, clocks, selectmenCertifications } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { setSubstep, transitionApplication } from '@/features/applications/transition'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { GateResult } from '@/features/gates/evaluateGates'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export const PB_DECISION_KEY = 'nh.pb.decision'

export type CertificationError =
  | 'forbidden'
  | 'not_found'
  | 'not_under_review'
  | 'clock_not_overdue'
  | 'invalid_state'
  | { gateBlocked: GateResult[] }

export async function recordSelectmenCertification(
  db: Db,
  actor: Actor,
  input: {
    applicationId: string
    requestedOn: CivilDate
    outcome: 'pending' | 'certified' | 'refused'
    decidedOn?: CivilDate
  },
  signal: AbortSignal,
): Promise<Result<void, CertificationError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  return await transactionResult<void, CertificationError>(db, async (tx) => {
    await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .for('update')
    const app = await loadApplicationContext(tx, input.applicationId, signal)
    if (app === null) return err('not_found')
    if (app.state !== 'under_review') return err('not_under_review')
    const [overdue] = await tx
      .select({ id: clocks.id })
      .from(clocks)
      .where(
        and(
          eq(clocks.applicationId, app.id),
          eq(clocks.ruleKey, PB_DECISION_KEY),
          inArray(clocks.status, ['running', 'overdue']),
          lt(clocks.currentDue, input.requestedOn),
        ),
      )
      .orderBy(desc(clocks.createdAt))
      .limit(1)
    if (overdue === undefined) return err('clock_not_overdue')
    const decidedOn = input.decidedOn ?? input.requestedOn
    if (input.outcome === 'certified') {
      const moved = await transitionApplication(
        tx,
        actor,
        {
          applicationId: app.id,
          to: 'decided',
          expectedRowVersion: app.rowVersion,
          onDate: decidedOn,
        },
        signal,
      )
      if (!moved.ok) {
        if (typeof moved.error !== 'string') return err(moved.error)
        return err(
          moved.error === 'forbidden' || moved.error === 'not_found'
            ? moved.error
            : 'invalid_state',
        )
      }
      const stepped = await setSubstep(
        tx,
        actor,
        {
          applicationId: app.id,
          substep: 'certified_by_selectmen',
          expectedRowVersion: moved.value.rowVersion,
        },
        signal,
      )
      if (!stepped.ok) return err('invalid_state')
    }
    await tx.insert(selectmenCertifications).values({
      applicationId: app.id,
      requestedOn: input.requestedOn,
      outcome: input.outcome,
      decidedOn: input.outcome === 'certified' ? decidedOn : null,
      recordedBy: actor.userId,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: `board.certification.${input.outcome}`,
        entityType: 'application',
        entityId: app.id,
        after: {
          requestedOn: input.requestedOn,
          decidedOn: input.outcome === 'certified' ? decidedOn : null,
        },
      },
      signal,
    )
    return ok(undefined)
  })
}
