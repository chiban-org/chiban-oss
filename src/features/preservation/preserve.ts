import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents, documentText, documentVersions, files, preservationRecords } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { storeGeneratedBytes } from '@/features/files/ingest'
import type { PdfaConverter } from '@/features/preservation/ghostscript'
import { wrapImageAsPdf } from '@/features/preservation/wrapImage'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const BATCH_LIMIT = 25
const PDF_TYPE = 'application/pdf'

export async function createPreservationRecord(
  db: DbOrTx,
  originalVersionId: string,
  required: boolean,
): Promise<void> {
  await db
    .insert(preservationRecords)
    .values({ originalVersionId, required, status: required ? 'pending' : 'not_required' })
    .onConflictDoNothing()
}

async function readBytes(
  store: ObjectStore,
  key: string,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const stream = await store.getStream(key, signal)
  if (!stream.ok) return null
  return new Uint8Array(await new Response(stream.value).arrayBuffer())
}

interface LoadedVersion {
  id: string
  documentId: string
  role: 'original' | 'public_redacted' | 'pdfa'
  contentType: string
  filename: string
  storageKey: string
}

async function loadVersion(db: DbOrTx, versionId: string): Promise<LoadedVersion | null> {
  const [row] = await db
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      role: documentVersions.role,
      contentType: documentVersions.contentType,
      filename: documentVersions.filename,
      storageKey: files.storageKey,
    })
    .from(documentVersions)
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(eq(documentVersions.id, versionId))
  return row ?? null
}

async function extractAndStoreText(
  db: DbOrTx,
  store: ObjectStore,
  converter: PdfaConverter,
  version: LoadedVersion,
  signal: AbortSignal,
): Promise<void> {
  const bytes = await readBytes(store, version.storageKey, signal)
  const extracted = bytes === null ? null : await converter.extractText(bytes, signal)
  const text = extracted?.ok === true ? extracted.value : ''
  await db
    .insert(documentText)
    .values({ versionId: version.id, text, hasTextLayer: text.trim() !== '' })
    .onConflictDoNothing()
}

async function markIncomplete(
  db: DbOrTx,
  recordId: string,
  reason: string,
  detail: string,
): Promise<void> {
  await db
    .update(preservationRecords)
    .set({ status: 'incomplete', reason, detail, updatedAt: new Date() })
    .where(eq(preservationRecords.id, recordId))
}

async function convertOriginal(
  db: DbOrTx,
  store: ObjectStore,
  converter: PdfaConverter,
  version: LoadedVersion,
  recordId: string,
  signal: AbortSignal,
): Promise<Result<'complete', 'incomplete'>> {
  await db
    .update(preservationRecords)
    .set({ attempts: sql`${preservationRecords.attempts} + 1` })
    .where(eq(preservationRecords.id, recordId))
  const bytes = await readBytes(store, version.storageKey, signal)
  if (bytes === null) {
    await markIncomplete(db, recordId, 'conversion_failed', 'The stored file is missing')
    return err('incomplete')
  }
  const isImage = version.contentType === 'image/jpeg' || version.contentType === 'image/png'
  let source = bytes
  if (isImage) {
    try {
      source = await wrapImageAsPdf(bytes, version.contentType as 'image/jpeg' | 'image/png')
    } catch (e) {
      await markIncomplete(
        db,
        recordId,
        'conversion_failed',
        e instanceof Error ? e.message : 'unreadable image',
      )
      return err('incomplete')
    }
  }
  const converted = await converter.toPdfA(source, signal)
  if (!converted.ok) {
    await markIncomplete(db, recordId, converted.error.reason, converted.error.detail)
    return err('incomplete')
  }
  const stored = await storeGeneratedBytes(db, store, converted.value, PDF_TYPE, signal)
  const [created] = await db
    .insert(documentVersions)
    .values({
      documentId: version.documentId,
      role: 'pdfa',
      fileSha256: stored.sha256,
      filename: `${version.filename.replace(/\.[^.]+$/, '')}.pdf`,
      contentType: PDF_TYPE,
    })
    .returning({ id: documentVersions.id })
  await db
    .update(preservationRecords)
    .set({
      status: 'complete',
      reason: null,
      detail: null,
      pdfaVersionId: created?.id ?? null,
      updatedAt: new Date(),
    })
    .where(eq(preservationRecords.id, recordId))
  return ok('complete')
}

export async function preserveVersion(
  db: DbOrTx,
  store: ObjectStore,
  converter: PdfaConverter,
  versionId: string,
  signal: AbortSignal,
): Promise<Result<'complete' | 'not_required', 'incomplete'>> {
  signal.throwIfAborted()
  const version = await loadVersion(db, versionId)
  if (version === null || version.role === 'pdfa') return ok('not_required')
  if (version.contentType === PDF_TYPE) {
    const [existing] = await db
      .select()
      .from(documentText)
      .where(eq(documentText.versionId, version.id))
    if (existing === undefined) await extractAndStoreText(db, store, converter, version, signal)
  }
  if (version.role !== 'original') return ok('not_required')
  const [record] = await db
    .select()
    .from(preservationRecords)
    .where(eq(preservationRecords.originalVersionId, version.id))
  if (record === undefined || record.status === 'not_required') return ok('not_required')
  if (record.status === 'complete') return ok('complete')
  if (record.status === 'incomplete') return err('incomplete')
  return await convertOriginal(db, store, converter, version, record.id, signal)
}

export async function processPreservation(
  db: DbOrTx,
  store: ObjectStore,
  converter: PdfaConverter,
  signal: AbortSignal,
  limit: number = BATCH_LIMIT,
): Promise<number> {
  const pending = await db
    .select({ id: preservationRecords.originalVersionId })
    .from(preservationRecords)
    .where(eq(preservationRecords.status, 'pending'))
    .orderBy(asc(preservationRecords.updatedAt))
    .limit(limit)
  const untexted = await db
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .leftJoin(documentText, eq(documentText.versionId, documentVersions.id))
    .where(
      and(
        eq(documentVersions.contentType, PDF_TYPE),
        inArray(documentVersions.role, ['original', 'public_redacted']),
        isNull(documentText.versionId),
      ),
    )
    .limit(limit)
  const ids = [...new Set([...pending, ...untexted].map((r) => r.id))]
  for (const id of ids) await preserveVersion(db, store, converter, id, signal)
  return ids.length
}

export async function retryPreservation(
  db: DbOrTx,
  actor: Actor,
  input: { recordId: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const [reset] = await db
    .update(preservationRecords)
    .set({ status: 'pending', reason: null, detail: null, updatedAt: new Date() })
    .where(
      and(eq(preservationRecords.id, input.recordId), eq(preservationRecords.status, 'incomplete')),
    )
    .returning({ versionId: preservationRecords.originalVersionId })
  if (reset === undefined) return err('not_found')
  await db.delete(documentText).where(eq(documentText.versionId, reset.versionId))
  return ok(undefined)
}

export interface IncompleteRow {
  recordId: string
  documentId: string
  title: string
  reason: string | null
  detail: string | null
  attempts: number
  updatedAt: string
}

export async function listPreservationIncomplete(
  db: DbOrTx,
  actor: Actor,
  input: { limit: number; cursor?: string },
  signal: AbortSignal,
): Promise<Result<{ rows: IncompleteRow[]; nextCursor: string | null }, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.manage', signal)
  if (!allowed.ok) return err('forbidden')
  const rows = await db
    .select({
      recordId: preservationRecords.id,
      documentId: documents.id,
      title: documents.title,
      reason: preservationRecords.reason,
      detail: preservationRecords.detail,
      attempts: preservationRecords.attempts,
      updatedAt: preservationRecords.updatedAt,
    })
    .from(preservationRecords)
    .innerJoin(documentVersions, eq(documentVersions.id, preservationRecords.originalVersionId))
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(
      and(
        eq(preservationRecords.status, 'incomplete'),
        input.cursor === undefined ? undefined : gt(preservationRecords.id, input.cursor),
      ),
    )
    .orderBy(asc(preservationRecords.id))
    .limit(input.limit + 1)
  const page = rows.slice(0, input.limit)
  return ok({
    rows: page.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.recordId ?? null) : null,
  })
}
