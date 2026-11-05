import { and, count, eq, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  configVersions,
  exportsTable,
  healthAlerts,
  importExceptions,
  users,
  workerState,
} from '@/db/schema'
import { type ConfigKind, isConfigKind } from '@/features/config/kinds'
import { LAYER_KEYS } from '@/features/gis/exceptionKinds'
import { getLayerStatus } from '@/features/gis/layerStatus'
import { splitJobs } from '@/features/health/jobAttention'
import { jobHealth } from '@/features/health/jobHealth'
import { type StaffStatus, statusSql } from '@/features/users/staffAccounts'

export async function healthProblems(db: Db, now: Date, signal: AbortSignal): Promise<number> {
  const [jobs, [firing], workers] = await Promise.all([
    jobHealth(db, now, signal),
    db.select({ n: count() }).from(healthAlerts).where(eq(healthAlerts.state, 'firing')),
    db.select({ id: workerState.id }).from(workerState).limit(1),
  ])
  const noWorker = workers.length === 0 ? 1 : 0
  return splitJobs(jobs).attention.length + (firing?.n ?? 0) + noWorker
}

export async function staffStatusCounts(
  db: Db,
  signal: AbortSignal,
): Promise<ReadonlyMap<StaffStatus, number>> {
  signal.throwIfAborted()
  const rows = await db
    .select({ status: statusSql, n: count() })
    .from(users)
    .where(eq(users.kind, 'staff'))
    .groupBy(statusSql)
  return new Map(rows.map((row) => [row.status, row.n]))
}

export async function draftsByKind(
  db: Db,
  signal: AbortSignal,
): Promise<{ kind: ConfigKind; count: number }[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({ kind: configVersions.kind, n: count() })
    .from(configVersions)
    .where(eq(configVersions.status, 'draft'))
    .groupBy(configVersions.kind)
    .orderBy(configVersions.kind)
  return rows.flatMap((row) => (isConfigKind(row.kind) ? [{ kind: row.kind, count: row.n }] : []))
}

export async function layersNeedingImport(db: Db, now: Date, signal: AbortSignal): Promise<number> {
  const states = await Promise.all(LAYER_KEYS.map((key) => getLayerStatus(db, key, now, signal)))
  return states.filter((s) => s.state === 'import_failed' || s.state === 'stale').length
}

export async function openImportExceptions(db: Db, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ n: count() })
    .from(importExceptions)
    .where(eq(importExceptions.status, 'open'))
  return row?.n ?? 0
}

export async function exportsFailedSinceLastGood(db: Db, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted()
  const lastGood = sql`coalesce((select max(e.requested_at) from exports e
    where e.kind = 'business' and e.status = 'ready'), '-infinity'::timestamptz)`
  const [row] = await db
    .select({ n: count() })
    .from(exportsTable)
    .where(
      and(
        eq(exportsTable.kind, 'business'),
        eq(exportsTable.status, 'failed'),
        sql`${exportsTable.requestedAt} > ${lastGood}`,
      ),
    )
  return row?.n ?? 0
}
