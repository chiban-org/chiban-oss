import { and, eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { documents, migrationBatches } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { err, ok, type Result } from '@/types/result'

export type PublishError = 'forbidden' | 'not_found' | 'not_staged'

export async function publishMigrationBatch(
  db: Db,
  actor: Actor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<{ published: number }, PublishError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.publish', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const [batch] = await tx
      .select({ status: migrationBatches.status })
      .from(migrationBatches)
      .where(eq(migrationBatches.id, batchId))
      .for('update')
    if (batch === undefined) return err('not_found')
    if (batch.status !== 'staged') return err('not_staged')
    const changed = await tx
      .update(documents)
      .set({ isPublic: true, publicChangedBy: actor.userId, publicChangedAt: new Date() })
      .where(
        and(
          eq(documents.migrationBatchId, batchId),
          eq(documents.docKind, 'parcel_file'),
          sql`exists (
            select 1 from parcel_record_links l
            where l.record_kind = 'document' and l.record_id = ${documents.id} and l.status = 'linked')`,
        ),
      )
      .returning({ id: documents.id })
    for (const doc of changed) {
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'document.publish',
          entityType: 'document',
          entityId: doc.id,
          after: { isPublic: true, batchId },
        },
        signal,
      )
    }
    await tx
      .update(migrationBatches)
      .set({ status: 'published', updatedAt: new Date() })
      .where(eq(migrationBatches.id, batchId))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'migration.publish',
        entityType: 'migration_batch',
        entityId: batchId,
        after: { published: changed.length },
      },
      signal,
    )
    return ok({ published: changed.length })
  })
}
