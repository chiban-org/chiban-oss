import { asc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documentVersions, files, redactionBoxes, redactionJobs } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import { storeGeneratedBytes } from '@/features/files/ingest'
import type { PdfaConverter } from '@/features/preservation/ghostscript'
import { preserveVersion } from '@/features/preservation/preserve'
import { redactImage } from '@/features/redaction/redactImage'
import { redactPdf } from '@/features/redaction/redactPdf'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export interface RedactionEngine {
  redactPdf: typeof redactPdf
  redactImage: typeof redactImage
}

type Outcome = 'complete' | 'failed' | 'already_done'

async function readSource(
  store: ObjectStore,
  key: string,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const stream = await store.getStream(key, signal)
  if (!stream.ok) return null
  return new Uint8Array(await new Response(stream.value).arrayBuffer())
}

async function markFailed(db: DbOrTx, jobId: string, reason: string): Promise<void> {
  await db
    .update(redactionJobs)
    .set({ status: 'failed', failureReason: reason, finishedAt: new Date() })
    .where(eq(redactionJobs.id, jobId))
}

export async function runRedactionJob(
  db: DbOrTx,
  store: ObjectStore,
  converter: PdfaConverter,
  input: { jobId: string },
  signal: AbortSignal,
  engine: Partial<RedactionEngine> = {},
): Promise<Result<Outcome, 'not_found'>> {
  signal.throwIfAborted()
  const pdfEngine = engine.redactPdf ?? redactPdf
  const imageEngine = engine.redactImage ?? redactImage
  const [job] = await db
    .select()
    .from(redactionJobs)
    .where(eq(redactionJobs.id, input.jobId))
    .for('update')
  if (job === undefined) return err('not_found')
  if (job.status !== 'queued') return ok('already_done')
  const [source] = await db
    .select({
      contentType: documentVersions.contentType,
      filename: documentVersions.filename,
      storageKey: files.storageKey,
    })
    .from(documentVersions)
    .innerJoin(files, eq(files.sha256, documentVersions.fileSha256))
    .where(eq(documentVersions.id, job.sourceVersionId))
  const boxes = await db
    .select()
    .from(redactionBoxes)
    .where(eq(redactionBoxes.jobId, job.id))
    .orderBy(asc(redactionBoxes.id))
  const bytes = source === undefined ? null : await readSource(store, source.storageKey, signal)
  if (source === undefined || bytes === null) {
    await markFailed(db, job.id, 'source_missing: The stored source file could not be read')
    return ok('failed')
  }
  let output: Uint8Array
  if (source.contentType === 'application/pdf') {
    const result = await pdfEngine(
      bytes,
      boxes.flatMap((b) => (b.pdfBox === null ? [] : [b.pdfBox])),
      signal,
    )
    if (!result.ok) {
      await markFailed(db, job.id, `${result.error.reason}: ${result.error.detail}`)
      return ok('failed')
    }
    output = result.value.bytes
  } else {
    const result = await imageEngine(
      bytes,
      source.contentType === 'image/png' ? 'image/png' : 'image/jpeg',
      boxes.flatMap((b) => (b.imageBox === null ? [] : [b.imageBox])),
    )
    if (!result.ok) {
      await markFailed(db, job.id, `${result.error}: The image could not be redacted`)
      return ok('failed')
    }
    output = result.value.bytes
  }
  const stored = await storeGeneratedBytes(db, store, output, source.contentType, signal)
  const stem = source.filename.replace(/\.[^.]+$/, '')
  const extension = source.filename.slice(stem.length)
  const [created] = await db
    .insert(documentVersions)
    .values({
      documentId: job.documentId,
      role: job.purpose === 'public' ? 'public_redacted' : 'release_redacted',
      fileSha256: stored.sha256,
      filename: `${stem}-redacted${extension}`,
      contentType: source.contentType,
      createdBy: job.createdBy,
      derivedFromVersionId: job.sourceVersionId,
      redactionJobId: job.id,
    })
    .returning({ id: documentVersions.id })
  const versionId = created?.id ?? ''
  await db
    .update(redactionJobs)
    .set({ status: 'complete', resultVersionId: versionId, finishedAt: new Date() })
    .where(eq(redactionJobs.id, job.id))
  await writeAudit(
    db,
    {
      actor: { kind: 'user', userId: job.createdBy },
      action: 'redaction.completed',
      entityType: 'document',
      entityId: job.documentId,
      after: { jobId: job.id, versionId, purpose: job.purpose },
    },
    signal,
  )
  await preserveVersion(db, store, converter, versionId, signal)
  return ok('complete')
}
