import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { DbOrTx } from '@/db/client'
import { migrationBatches } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { mayMigrate } from '@/features/migration/access'
import { computeReport, listExceptionItems } from '@/features/migration/batchReport'
import type { MigrationReport } from '@/features/migration/types'
import { err, ok, type Result } from '@/types/result'

export type BatchRow = typeof migrationBatches.$inferSelect

export async function listBatches(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<BatchRow[], 'forbidden'>> {
  signal.throwIfAborted()
  if (!(await mayMigrate(db, actor, signal))) return err('forbidden')
  return ok(await db.select().from(migrationBatches).orderBy(desc(migrationBatches.createdAt)))
}

export interface BatchDetail {
  batch: BatchRow
  report: MigrationReport | null
  exceptions: Awaited<ReturnType<typeof listExceptionItems>>
}

export async function loadBatchDetail(
  db: DbOrTx,
  actor: Actor,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<BatchDetail, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  if (!(await mayMigrate(db, actor, signal))) return err('forbidden')
  if (!z.uuid().safeParse(batchId).success) return err('not_found')
  const [batch] = await db.select().from(migrationBatches).where(eq(migrationBatches.id, batchId))
  if (batch === undefined) return err('not_found')
  const ran = batch.status === 'staged' || batch.status === 'published'
  return ok({
    batch,
    report: ran ? await computeReport(db, batchId) : null,
    exceptions: await listExceptionItems(db, batchId),
  })
}
