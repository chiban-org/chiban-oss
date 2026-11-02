import { and, asc, eq, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { gisLayers, migrationBatches, migrationItems } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { type CamaMapping, camaMappingSchema, DEFAULT_CAMA_MAPPING } from '@/features/cama/mapping'
import { mayMigrate } from '@/features/migration/access'
import { computeReport } from '@/features/migration/batchReport'
import { compileFolderPattern } from '@/features/migration/folderPattern'
import { importItem } from '@/features/migration/importItem'
import type { OcrConverter } from '@/features/migration/ocrmypdf'
import type { MigrationReport } from '@/features/migration/types'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export type RunError = 'forbidden' | 'not_found' | 'already_published' | 'invalid_pattern'

async function idParts(db: Db): Promise<CamaMapping['id']['parts']> {
  const [layer] = await db.select().from(gisLayers).where(eq(gisLayers.key, 'cama'))
  const mapping = camaMappingSchema.safeParse(layer?.mapping)
  return (mapping.success ? mapping.data : DEFAULT_CAMA_MAPPING).id.parts
}

export async function runBatch(
  db: Db,
  store: ObjectStore,
  converter: OcrConverter,
  actor: Actor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<MigrationReport, RunError>> {
  signal.throwIfAborted()
  if (!(await mayMigrate(db, actor, signal))) return err('forbidden')
  const [batch] = await db.select().from(migrationBatches).where(eq(migrationBatches.id, batchId))
  if (batch === undefined) return err('not_found')
  if (batch.status === 'published') return err('already_published')
  const pattern = compileFolderPattern(batch.folderPattern)
  if (pattern === null) return err('invalid_pattern')
  const pending = await db
    .select()
    .from(migrationItems)
    .where(and(eq(migrationItems.batchId, batchId), isNull(migrationItems.outcome)))
    .orderBy(asc(migrationItems.sourcePath))
  if (pending.length > 0) {
    await db
      .update(migrationBatches)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(migrationBatches.id, batchId))
    const context = {
      db,
      store,
      converter,
      actor,
      batch,
      pattern,
      parts: await idParts(db),
      signal,
    }
    for (const item of pending) await importItem(context, item)
  }
  const report = await computeReport(db, batchId)
  if (pending.length > 0 || batch.status !== 'staged') {
    await db.transaction(async (tx) => {
      await tx
        .update(migrationBatches)
        .set({ status: 'staged', report, updatedAt: new Date() })
        .where(eq(migrationBatches.id, batchId))
      await writeAudit(
        tx,
        {
          actor: { kind: 'user', userId: actor.userId },
          action: 'migration.run',
          entityType: 'migration_batch',
          entityId: batchId,
          after: report,
        },
        signal,
      )
    })
  }
  return ok(report)
}
