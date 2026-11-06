import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type ExportRow, exportsTable } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const DOWNLOAD_LINK_SECONDS = 60
const EXPORT_LOCK = 8_640_001
const LIST_LIMIT = 50

export async function requestExport(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<{ exportId: string }, 'forbidden' | 'export_running'>> {
  if (!(await hasCapability(db, actor.userId, 'export.download', signal))) return err('forbidden')
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${EXPORT_LOCK})`)
    const [active] = await tx
      .select({ id: exportsTable.id })
      .from(exportsTable)
      .where(
        and(eq(exportsTable.kind, 'business'), inArray(exportsTable.status, ['queued', 'running'])),
      )
      .limit(1)
    if (active !== undefined) return err('export_running')
    const [row] = await tx
      .insert(exportsTable)
      .values({ kind: 'business', status: 'queued', requestedBy: actor.userId })
      .returning({ id: exportsTable.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'export.requested',
        entityType: 'export',
        entityId: row?.id ?? '',
      },
      signal,
    )
    return ok({ exportId: row?.id ?? '' })
  })
}

export async function listExports(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<ExportRow[], 'forbidden'>> {
  if (!(await hasCapability(db, actor.userId, 'export.download', signal))) return err('forbidden')
  const rows = await db
    .select()
    .from(exportsTable)
    .where(eq(exportsTable.kind, 'business'))
    .orderBy(desc(exportsTable.requestedAt))
    .limit(LIST_LIMIT)
  return ok(rows)
}

export async function downloadLink(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  exportId: string,
  signal: AbortSignal,
): Promise<Result<{ url: string }, 'forbidden' | 'not_found'>> {
  if (!(await hasCapability(db, actor.userId, 'export.download', signal))) return err('forbidden')
  const [row] = await db
    .select()
    .from(exportsTable)
    .where(and(eq(exportsTable.id, exportId), eq(exportsTable.kind, 'business')))
    .limit(1)
  if (row?.status !== 'ready' || row.storageKey === null) return err('not_found')
  const url = await store.presignGet(row.storageKey, {
    expiresSeconds: DOWNLOAD_LINK_SECONDS,
    filename: row.storageKey.split('/').pop() ?? 'chiban-export.zip',
    contentType: 'application/zip',
    disposition: 'attachment',
  })
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'export.downloaded',
      entityType: 'export',
      entityId: row.id,
    },
    signal,
  )
  return ok({ url })
}
