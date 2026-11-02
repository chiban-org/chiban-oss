import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { type ExportTargetRow, exportsTable, exportTargets } from '@/db/schema'
import { EXPORT_ROOT } from '@/features/export/exportIndex'
import { getTownSettings } from '@/features/town/settings'
import { todayInTimeZone } from '@/types/civilDate'

async function readyThisMonth(db: Db, targetId: string, month: string): Promise<boolean> {
  const ready = await db
    .select({ storageKey: exportsTable.storageKey })
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.targetId, targetId),
        eq(exportsTable.kind, 'incremental'),
        eq(exportsTable.status, 'ready'),
      ),
    )
  return ready.some((r) => {
    const key = r.storageKey ?? ''
    return key === `${EXPORT_ROOT}/${month}` || key.startsWith(`${EXPORT_ROOT}/${month}-`)
  })
}

export async function dueTargets(
  db: Db,
  now: Date,
  signal: AbortSignal,
): Promise<ExportTargetRow[]> {
  const town = await getTownSettings(db, signal)
  const zone = town.ok ? town.value.timeZone : 'UTC'
  const today = todayInTimeZone(zone, now)
  const month = today.slice(0, 7)
  const dayNumber = Number(today.slice(8, 10))
  const active = await db.select().from(exportTargets).where(eq(exportTargets.isActive, true))
  const due: ExportTargetRow[] = []
  for (const target of active) {
    signal.throwIfAborted()
    if (target.runRequestedAt !== null) due.push(target)
    else if (dayNumber >= target.dayOfMonth && !(await readyThisMonth(db, target.id, month))) {
      due.push(target)
    }
  }
  return due
}
