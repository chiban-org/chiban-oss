import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db, Tx } from '@/db/client'
import {
  applicationSnapshots,
  boardPacketItems,
  type DispositionOutcome,
  dispositionBatches,
  dispositionItems,
  dispositionTombstones,
  documentRenditions,
  documents,
  documentText,
  documentVersions,
  preservationRecords,
  redactionBoxes,
  redactionJobs,
  renditionApprovals,
  rtkReleaseItems,
} from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { checkDisposition } from '@/features/records/disposition'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface ExecutionReport {
  disposed: number
  skippedHold: number
  skippedNotEligible: number
  fileHashes: string[]
}

type Item = typeof dispositionItems.$inferSelect
type Batch = typeof dispositionBatches.$inferSelect

async function setOutcome(tx: Tx, item: Item, outcome: DispositionOutcome): Promise<void> {
  await tx.update(dispositionItems).set({ outcome }).where(itemKey(item))
}

function itemKey(item: Item) {
  return and(
    eq(dispositionItems.batchId, item.batchId),
    eq(dispositionItems.recordKind, item.recordKind),
    eq(dispositionItems.recordId, item.recordId),
  )
}

async function settledOutcome(tx: Tx, item: Item): Promise<DispositionOutcome | null> {
  const [current] = await tx
    .select({ outcome: dispositionItems.outcome })
    .from(dispositionItems)
    .where(itemKey(item))
  return current?.outcome ?? null
}

async function titleOf(tx: Tx, item: Item): Promise<string> {
  if (item.recordKind === 'document') {
    const [row] = await tx
      .select({ title: documents.title })
      .from(documents)
      .where(eq(documents.id, item.recordId))
    return row?.title ?? item.recordId
  }
  const [snap] = await tx
    .select({ sequence: applicationSnapshots.sequence })
    .from(applicationSnapshots)
    .where(eq(applicationSnapshots.id, item.recordId))
  return `Application snapshot ${snap?.sequence ?? ''}`.trim()
}

async function deleteDocumentRecords(
  tx: Tx,
  documentId: string,
  versionIds: string[],
): Promise<void> {
  const withdraw = {
    versionId: null,
    approvalId: null,
    formerVersionId: sql`coalesce(version_id, former_version_id)`,
    withdrawnAt: sql`coalesce(withdrawn_at, clock_timestamp())`,
    withdrawnReason: sql`coalesce(withdrawn_reason, 'disposed')`,
  }
  await tx.update(rtkReleaseItems).set(withdraw).where(eq(rtkReleaseItems.documentId, documentId))
  await tx.update(boardPacketItems).set(withdraw).where(eq(boardPacketItems.documentId, documentId))
  await tx.delete(renditionApprovals).where(eq(renditionApprovals.documentId, documentId))
  const jobs = await tx
    .select({ id: redactionJobs.id })
    .from(redactionJobs)
    .where(eq(redactionJobs.documentId, documentId))
  if (jobs.length > 0) {
    await tx.delete(redactionBoxes).where(
      inArray(
        redactionBoxes.jobId,
        jobs.map((j) => j.id),
      ),
    )
    await tx.delete(redactionJobs).where(eq(redactionJobs.documentId, documentId))
  }
  if (versionIds.length === 0) return
  await tx.delete(documentRenditions).where(inArray(documentRenditions.versionId, versionIds))
  await tx.delete(documentText).where(inArray(documentText.versionId, versionIds))
  await tx
    .delete(preservationRecords)
    .where(
      or(
        inArray(preservationRecords.originalVersionId, versionIds),
        inArray(preservationRecords.pdfaVersionId, versionIds),
      ),
    )
}

async function disposeOne(
  tx: Tx,
  batch: Batch,
  item: Item,
  signal: AbortSignal,
): Promise<DispositionOutcome> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('records.disposition'))`)
  const settled = await settledOutcome(tx, item)
  if (settled !== null) return settled
  const ref = { kind: item.recordKind, id: item.recordId }
  const checked = await checkDisposition(tx, ref, batch.asOf as CivilDate, signal)
  if (!checked.ok) {
    const outcome = checked.error === 'on_hold' ? 'skipped_hold' : 'skipped_not_eligible'
    await setOutcome(tx, item, outcome)
    return outcome
  }
  const found = checked.value
  const versions =
    item.recordKind === 'document'
      ? await tx
          .select({ id: documentVersions.id, sha: documentVersions.fileSha256 })
          .from(documentVersions)
          .where(eq(documentVersions.documentId, item.recordId))
      : []
  const title = await titleOf(tx, item)
  const [tombstone] = await tx
    .insert(dispositionTombstones)
    .values({
      batchId: batch.id,
      recordKind: item.recordKind,
      recordId: item.recordId,
      title,
      seriesKey: found.series.key,
      seriesVersion: String(found.series.version),
      seriesCitation: found.series.citation,
      retentionBasis: {
        state: found.status.state,
        eligibleOn: found.status.state === 'eligible_on' ? found.status.date : null,
        events: found.events.map((e) => ({ kind: e.kind, occurredOn: e.occurredOn })),
      },
      versionIds: versions.map((v) => v.id),
      fileSha256s: [...new Set(versions.map((v) => v.sha))],
      proposedBy: batch.proposedBy,
      approvedBy: batch.approvedBy ?? batch.proposedBy,
      executedAt: sql`clock_timestamp()`,
    })
    .returning({ id: dispositionTombstones.id })
  const tombstoneId = tombstone?.id ?? ''
  await tx.execute(sql`select set_config('chiban.disposition', ${batch.id}, true)`)
  if (item.recordKind === 'document') {
    await deleteDocumentRecords(
      tx,
      item.recordId,
      versions.map((v) => v.id),
    )
    await tx.delete(documentVersions).where(eq(documentVersions.documentId, item.recordId))
    await tx
      .update(documents)
      .set({ disposedAt: sql`clock_timestamp()`, disposedTombstoneId: tombstoneId })
      .where(eq(documents.id, item.recordId))
  } else {
    await tx.delete(applicationSnapshots).where(eq(applicationSnapshots.id, item.recordId))
  }
  await setOutcome(tx, item, 'disposed')
  await writeAudit(
    tx,
    {
      actor: { kind: 'system', job: 'records.dispose' },
      action: 'disposition.record_disposed',
      entityType: item.recordKind,
      entityId: item.recordId,
      after: { batchId: batch.id, tombstoneId, seriesKey: found.series.key },
    },
    signal,
  )
  return 'disposed'
}

export async function executeDisposition(
  db: Db,
  input: { batchId: string },
  signal: AbortSignal,
): Promise<Result<ExecutionReport, 'not_approved'>> {
  signal.throwIfAborted()
  const [batch] = await db
    .update(dispositionBatches)
    .set({ status: 'executing' })
    .where(
      and(
        eq(dispositionBatches.id, input.batchId),
        inArray(dispositionBatches.status, ['approved', 'executing']),
      ),
    )
    .returning()
  if (batch === undefined) return err('not_approved')
  const pending = await db
    .select()
    .from(dispositionItems)
    .where(and(eq(dispositionItems.batchId, batch.id), isNull(dispositionItems.outcome)))
    .orderBy(asc(dispositionItems.recordKind), asc(dispositionItems.recordId))
  for (const item of pending) {
    signal.throwIfAborted()
    await db.transaction((tx) => disposeOne(tx, batch, item, signal))
  }
  const items = await db
    .select()
    .from(dispositionItems)
    .where(eq(dispositionItems.batchId, batch.id))
  await db
    .update(dispositionBatches)
    .set({ status: 'executed', executedAt: sql`clock_timestamp()` })
    .where(eq(dispositionBatches.id, batch.id))
  const tombstones = await db
    .select({ hashes: dispositionTombstones.fileSha256s })
    .from(dispositionTombstones)
    .where(eq(dispositionTombstones.batchId, batch.id))
  return ok({
    disposed: items.filter((i) => i.outcome === 'disposed').length,
    skippedHold: items.filter((i) => i.outcome === 'skipped_hold').length,
    skippedNotEligible: items.filter((i) => i.outcome === 'skipped_not_eligible').length,
    fileHashes: [...new Set(tombstones.flatMap((t) => t.hashes))],
  })
}
