import { and, asc, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { dispositionBatches, dispositionItems, documents, retentionAssignments } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { loadPack } from '@/features/packs/loadPack'
import { checkDisposition, retentionFor } from '@/features/records/disposition'
import { townToday } from '@/features/town/today'
import { type CivilDate, daysBetween } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const ProposeSchema = z.object({
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seriesKeys: z.array(z.string().min(1).max(100)).max(50).optional(),
})

const OPEN_STATUSES = ['proposed', 'approved', 'executing'] as const

export async function proposeDisposition(
  db: Db,
  actor: Actor,
  input: { asOf: CivilDate; seriesKeys?: string[] },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<
    { batchId: string; items: number },
    'forbidden' | 'invalid' | 'nothing_eligible' | 'future_date'
  >
> {
  signal.throwIfAborted()
  const mayPropose =
    (await hasCapability(db, actor.userId, 'disposition.propose', signal)) ||
    (await hasCapability(db, actor.userId, 'disposition.approve', signal))
  if (!mayPropose) return err('forbidden')
  const parsed = ProposeSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const asOf = parsed.data.asOf as CivilDate
  const permanent = loadPack()
    .recordSeries.filter((s) => s.retention.kind === 'permanent')
    .map((s) => s.key)
  const seriesKeys = parsed.data.seriesKeys
  return await transactionResult(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('records.disposition'))`)
    if (daysBetween(await townToday(tx, now, signal), asOf) > 0) return err('future_date')
    const candidates = await tx
      .select({
        kind: retentionAssignments.recordKind,
        id: retentionAssignments.recordId,
      })
      .from(retentionAssignments)
      .where(
        and(
          isNull(retentionAssignments.supersededAt),
          permanent.length === 0
            ? undefined
            : notInArray(retentionAssignments.seriesKey, permanent),
          seriesKeys === undefined
            ? undefined
            : inArray(retentionAssignments.seriesKey, seriesKeys),
        ),
      )
      .orderBy(asc(retentionAssignments.recordKind), asc(retentionAssignments.recordId))
    const open = await tx
      .select({ kind: dispositionItems.recordKind, id: dispositionItems.recordId })
      .from(dispositionItems)
      .innerJoin(dispositionBatches, eq(dispositionBatches.id, dispositionItems.batchId))
      .where(
        and(
          inArray(dispositionBatches.status, [...OPEN_STATUSES]),
          isNull(dispositionItems.outcome),
        ),
      )
    const taken = new Set(open.map((o) => `${o.kind}:${o.id}`))
    const disposed = new Set(
      (
        await tx.select({ id: documents.id }).from(documents).where(isNotNull(documents.disposedAt))
      ).map((r) => r.id),
    )
    const items: (typeof dispositionItems.$inferInsert)[] = []
    for (const candidate of candidates) {
      if (taken.has(`${candidate.kind}:${candidate.id}`)) continue
      if (candidate.kind === 'document' && disposed.has(candidate.id)) continue
      const ref = { kind: candidate.kind, id: candidate.id }
      if (!(await checkDisposition(tx, ref, asOf, signal)).ok) continue
      const found = await retentionFor(tx, ref, signal)
      if (found === null || found.status.state !== 'eligible_on') continue
      items.push({
        batchId: '',
        recordKind: candidate.kind,
        recordId: candidate.id,
        seriesKey: found.series.key,
        seriesVersion: String(found.series.version),
        eligibleOn: found.status.date,
      })
    }
    if (items.length === 0) return err('nothing_eligible')
    const [batch] = await tx
      .insert(dispositionBatches)
      .values({ asOf, proposedBy: actor.userId })
      .returning({ id: dispositionBatches.id })
    const batchId = batch?.id ?? ''
    await tx.insert(dispositionItems).values(items.map((i) => ({ ...i, batchId })))
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'disposition.proposed',
        entityType: 'disposition_batch',
        entityId: batchId,
        after: { asOf, items: items.length },
      },
      signal,
    )
    return ok({ batchId, items: items.length })
  })
}
