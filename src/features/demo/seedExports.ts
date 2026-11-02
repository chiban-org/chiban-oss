import { mkdir } from 'node:fs/promises'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { exportsTable, exportTargets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { must } from '@/features/demo/seedPermitSupport'
import { requestExport } from '@/features/export/requestExport'
import { saveTarget } from '@/features/export/targets/manageTargets'
import type { ObjectStore } from '@/features/storage/objectStore'
import { buildBusinessExport } from '@/jobs/exportsBuild'

const TARGET_DAY_OF_MONTH = 5

export async function seedExportTarget(
  db: Db,
  admin: Actor,
  exportDir: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const existing = await db.select({ id: exportTargets.id }).from(exportTargets)
  if (existing.length > 0) return false
  await mkdir(exportDir, { recursive: true })
  must(
    await saveTarget(
      db,
      admin,
      {
        kind: 'local_fs',
        name: 'Town Hall archive drive',
        dayOfMonth: TARGET_DAY_OF_MONTH,
        settings: { root: exportDir },
        credentials: null,
      },
      signal,
    ),
    'save export target',
  )
  return true
}

export async function seedBusinessExport(
  db: Db,
  store: ObjectStore,
  admin: Actor,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const ready = await db
    .select({ id: exportsTable.id })
    .from(exportsTable)
    .where(and(eq(exportsTable.kind, 'business'), eq(exportsTable.status, 'ready')))
  if (ready.length > 0) return false
  const requested = must(await requestExport(db, admin, signal), 'request export')
  const built = await buildBusinessExport(db, store, requested.exportId, signal)
  must(built.ok ? { ok: true as const, value: true } : built, 'build export')
  return true
}
