import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { exportsTable } from '@/db/schema'
import { EXPORT_ROOT } from '@/features/export/exportIndex'
import { type ExportManifest, manifestSchema } from '@/features/export/manifest'
import { TargetFailure } from '@/features/export/targets/targetFailure'
import type { StorageTarget } from '@/features/export/targets/types'

export async function folderFor(
  db: Db,
  target: StorageTarget,
  targetId: string,
  month: string,
  signal: AbortSignal,
): Promise<string> {
  const rows = await db
    .select({ storageKey: exportsTable.storageKey })
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.targetId, targetId),
        eq(exportsTable.kind, 'incremental'),
        eq(exportsTable.status, 'ready'),
      ),
    )
  const recorded = new Set(rows.map((r) => r.storageKey ?? ''))
  for (let n = 1; ; n += 1) {
    const candidate = n === 1 ? month : `${month}-${n}`
    if (recorded.has(`${EXPORT_ROOT}/${candidate}`)) continue
    const present = await target.exists(`${EXPORT_ROOT}/${candidate}/manifest.json`, signal)
    if (!present.ok) throw new TargetFailure(present.error)
    if (!present.value) return candidate
  }
}

export async function lastReadyManifest(db: Db, targetId: string): Promise<ExportManifest | null> {
  const [row] = await db
    .select({ manifest: exportsTable.manifest })
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.targetId, targetId),
        eq(exportsTable.kind, 'incremental'),
        eq(exportsTable.status, 'ready'),
      ),
    )
    .orderBy(desc(exportsTable.finishedAt))
    .limit(1)
  const parsed = manifestSchema.safeParse(row?.manifest)
  return parsed.success ? parsed.data : null
}
