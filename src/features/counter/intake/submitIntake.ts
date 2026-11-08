import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { applications, counterIntakes } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { type SubmitError, submitApplication } from '@/features/applications/submitApplication'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { mayUseCounter } from '@/features/counter/counterAccess'
import { userName } from '@/features/inspections/inspectionView'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export type SubmitIntakeError = SubmitError | 'paper_attestation_required'

export interface SubmitIntakeInput {
  applicationId: string
  signedOnPaper: boolean
  now?: Date
  store?: ObjectStore
}

async function draftValues(db: Db, applicationId: string): Promise<Record<string, unknown> | null> {
  const [row] = await db
    .select({ values: applications.values })
    .from(counterIntakes)
    .innerJoin(applications, eq(applications.id, counterIntakes.applicationId))
    .where(eq(counterIntakes.applicationId, applicationId))
  return row === undefined ? null : (row.values as Record<string, unknown>)
}

export async function submitCounterIntake(
  db: Db,
  actor: Actor,
  input: SubmitIntakeInput,
  signal: AbortSignal,
): Promise<Result<{ state: 'submitted' }, SubmitIntakeError>> {
  signal.throwIfAborted()
  const { now = new Date(), store = getObjectStore() } = input
  if (!(await mayUseCounter(db, actor, signal))) return err('forbidden')
  if (!input.signedOnPaper) return err('paper_attestation_required')
  const values = await draftValues(db, input.applicationId)
  if (values === null) return err('not_found')
  const recordedBy = (await userName(db, actor.userId)) ?? 'Town staff'
  return await transactionResult<{ state: 'submitted' }, SubmitIntakeError>(db, async (tx) => {
    const submitted = await submitApplication(
      tx,
      actor,
      {
        applicationId: input.applicationId,
        values,
        attestation: { statementSha256: '' },
        paperAttestation: { recordedBy },
      },
      signal,
      now,
      store,
    )
    if (!submitted.ok) return err(submitted.error)
    await tx
      .update(counterIntakes)
      .set({ paperAttestationRecordedBy: actor.userId, paperAttestationRecordedAt: now })
      .where(eq(counterIntakes.applicationId, input.applicationId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'application.paper_attestation',
        entityType: 'application',
        entityId: input.applicationId,
        after: { recordedBy },
      },
      signal,
    )
    return ok(submitted.value)
  })
}
