import { and, desc, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { dispositionTombstones } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { findSeries } from '@/features/records/series'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

const MAX_LIMIT = 200

export interface TombstoneRow {
  id: string
  batchId: string
  recordKind: 'document' | 'application_snapshot'
  title: string
  seriesLabel: string
  citation: { label: string; url: string | null }
  executedAt: Date
  proposedBy: string
  approvedBy: string
}

export async function listTombstones(
  db: DbOrTx,
  actor: Actor,
  input: { limit: number; cursor?: string },
  signal: AbortSignal,
): Promise<Result<{ rows: TombstoneRow[]; nextCursor: string | null }, 'forbidden'>> {
  signal.throwIfAborted()
  const mayView =
    (await hasCapability(db, actor.userId, 'disposition.approve', signal)) ||
    (await hasCapability(db, actor.userId, 'disposition.propose', signal))
  if (!mayView) return err('forbidden')
  const limit = Math.min(Math.max(Math.trunc(input.limit), 1), MAX_LIMIT)
  const after = input.cursor !== undefined && isUuid(input.cursor) ? input.cursor : null
  const t = dispositionTombstones
  const found = await db
    .select()
    .from(t)
    .where(
      and(
        after === null
          ? undefined
          : sql`(${t.executedAt}, ${t.id}) < (select c.executed_at, c.id from disposition_tombstones c where c.id = ${after}::uuid)`,
      ),
    )
    .orderBy(desc(t.executedAt), desc(t.id))
    .limit(limit + 1)
  const rows: TombstoneRow[] = found.slice(0, limit).map((r) => ({
    id: r.id,
    batchId: r.batchId,
    recordKind: r.recordKind,
    title: r.title,
    seriesLabel: findSeries(r.seriesKey)?.label ?? r.seriesKey,
    citation: r.seriesCitation,
    executedAt: r.executedAt,
    proposedBy: r.proposedBy,
    approvedBy: r.approvedBy,
  }))
  const last = rows.at(-1)
  return ok({
    rows,
    nextCursor: found.length > limit && last !== undefined ? last.id : null,
  })
}
