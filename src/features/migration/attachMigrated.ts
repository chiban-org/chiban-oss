import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import {
  documents,
  documentText,
  documentVersions,
  migrationItems,
  preservationRecords,
} from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { AUDIENCES } from '@/features/documents/types'
import type { MigrationItemRow } from '@/features/migration/lookups'
import { linkRecordByRawRef } from '@/features/parcels/recordLinks'
import { resolveParcelId } from '@/features/parcels/resolveParcelId'
import { assignSeries } from '@/features/records/assignments'

export type OcrResult =
  | { ok: true; pdfSha256: string; text: string }
  | { ok: false; reason: string; detail: string }

export interface AttachBatch {
  id: string
  idFormat: string
  seriesKey: string
}

export interface AttachInput {
  item: MigrationItemRow
  folderKey: string
  original: { sha256: string; contentType: string }
  ocr: OcrResult
}

async function insertPreservation(
  tx: Tx,
  originalVersionId: string,
  pdfaVersionId: string | null,
  ocr: OcrResult,
): Promise<void> {
  if (ocr.ok) {
    await tx.insert(preservationRecords).values({
      originalVersionId,
      required: true,
      status: 'complete',
      attempts: 1,
      pdfaVersionId,
    })
    return
  }
  await tx.insert(preservationRecords).values({
    originalVersionId,
    required: true,
    status: 'incomplete',
    reason: `ocr_${ocr.reason}`,
    detail: ocr.detail,
    attempts: 1,
  })
}

export interface AttachContext {
  actor: Actor
  batch: AttachBatch
  signal: AbortSignal
}

export async function attachMigrated(
  tx: Tx,
  context: AttachContext,
  input: AttachInput,
): Promise<void> {
  const { actor, batch, signal } = context
  const { item, folderKey, original, ocr } = input
  const filename = path.posix.basename(item.sourcePath)
  const resolved = await resolveParcelId(tx, { format: batch.idFormat, value: folderKey }, signal)
  const target = resolved.ok
    ? { kind: 'parcel', id: resolved.value.parcelId }
    : { kind: 'migration_batch', id: batch.id }
  const [doc] = await tx
    .insert(documents)
    .values({
      recordKind: target.kind,
      recordId: target.id,
      title: filename,
      docKind: 'parcel_file',
      audiences: [...AUDIENCES],
      isPublic: false,
      createdByKind: 'user',
      createdBy: actor.userId,
      migrationBatchId: batch.id,
    })
    .returning({ id: documents.id })
  const documentId = doc?.id ?? ''
  const [version] = await tx
    .insert(documentVersions)
    .values({
      documentId,
      role: 'original',
      fileSha256: original.sha256,
      filename,
      contentType: original.contentType,
      createdBy: actor.userId,
    })
    .returning({ id: documentVersions.id })
  const link = await linkRecordByRawRef(
    tx,
    { recordKind: 'document', recordId: documentId, format: batch.idFormat, value: folderKey },
    signal,
  )
  await assignSeries(
    tx,
    { kind: 'document', id: documentId },
    batch.seriesKey,
    'staff',
    actor,
    signal,
  )
  let pdfaVersionId: string | null = null
  if (ocr.ok) {
    const [pdfa] = await tx
      .insert(documentVersions)
      .values({
        documentId,
        role: 'pdfa',
        fileSha256: ocr.pdfSha256,
        filename: `${filename.replace(/\.[^.]+$/, '')}.pdf`,
        contentType: 'application/pdf',
        createdBy: actor.userId,
      })
      .returning({ id: documentVersions.id })
    pdfaVersionId = pdfa?.id ?? null
    await tx.insert(documentText).values({
      versionId: pdfaVersionId ?? '',
      text: ocr.text,
      hasTextLayer: ocr.text.trim() !== '',
    })
  }
  await insertPreservation(tx, version?.id ?? '', pdfaVersionId, ocr)
  await tx
    .update(migrationItems)
    .set({
      outcome: 'imported',
      folderKey,
      documentId,
      parcelLink: link.status,
      ocrStatus: ocr.ok ? 'complete' : 'failed',
      ocrReason: ocr.ok ? null : ocr.reason,
    })
    .where(eq(migrationItems.id, item.id))
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: 'document.attach',
      entityType: target.kind,
      entityId: target.id,
      after: { documentId, docKind: 'parcel_file', sha256: original.sha256, batchId: batch.id },
    },
    signal,
  )
}
