import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { env } from '@/config/env'
import type { Db, DbOrTx, Tx } from '@/db/client'
import { uploadIntents } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { insertItemLink } from '@/features/applications/documentItems'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { attachDocument } from '@/features/documents/attach'
import type { DocKind, RecordRef } from '@/features/documents/types'
import { CASE_DOC_KINDS, mayUploadTo } from '@/features/documents/uploadAccess'
import { ingestTempObject } from '@/features/files/ingest'
import { type AllowedType, isAllowedType } from '@/features/files/sniff'
import { findSeries } from '@/features/records/series'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const INTENT_MINUTES = 15
const MINUTE_MS = 60 * 1000

export { mayUploadTo }

export interface UploadIntentInput {
  target: RecordRef
  title: string
  filename: string
  contentType: string
  sizeBytes: number
  seriesKey?: string
  docKind?: DocKind
  itemKey?: string
}

function docKindAllowed(kind: RecordRef['kind'], docKind: DocKind | undefined): boolean {
  if (docKind === undefined) return kind !== 'enforcement_case'
  return kind === 'enforcement_case' && CASE_DOC_KINDS.includes(docKind)
}

export async function createUploadIntent(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: UploadIntentInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<
  Result<
    { intentId: string; url: string; headers: Record<string, string> },
    | 'forbidden'
    | 'too_large'
    | 'empty'
    | 'type_not_allowed'
    | 'series_required'
    | 'unknown_series'
    | 'doc_kind_not_allowed'
  >
> {
  signal.throwIfAborted()
  const target = { ...input.target, itemKey: input.itemKey }
  if (!(await mayUploadTo(db, actor, target, signal, now))) return err('forbidden')
  if (!docKindAllowed(input.target.kind, input.docKind)) return err('doc_kind_not_allowed')
  if (!isAllowedType(input.contentType)) return err('type_not_allowed')
  if (input.sizeBytes > env.MAX_UPLOAD_BYTES) return err('too_large')
  if (input.sizeBytes < 1) return err('empty')
  if (input.target.kind === 'parcel') {
    if (input.seriesKey === undefined) return err('series_required')
    if (findSeries(input.seriesKey) === null) return err('unknown_series')
  }
  const tempKey = `uploads/tmp/${randomUUID()}`
  const [intent] = await db
    .insert(uploadIntents)
    .values({
      userId: actor.userId,
      targetKind: input.target.kind,
      targetId: input.target.id,
      title: input.title,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      tempKey,
      seriesKey: input.seriesKey ?? null,
      docKind: input.docKind ?? null,
      itemKey: input.itemKey,
      expiresAt: new Date(now.getTime() + INTENT_MINUTES * MINUTE_MS),
    })
    .returning({ id: uploadIntents.id })
  const url = await store.presignPut(tempKey, {
    contentType: input.contentType,
    contentLength: input.sizeBytes,
    expiresSeconds: INTENT_MINUTES * 60,
  })
  return ok({
    intentId: intent?.id ?? '',
    url,
    headers: { 'content-type': input.contentType },
  })
}

function docKindFor(kind: RecordRef['kind'], chosen: string | null): DocKind {
  if (chosen !== null) return chosen as DocKind
  if (kind === 'parcel') return 'parcel_file'
  return kind === 'inspection' ? 'inspection_photo' : 'attachment'
}

export type FinalizeError =
  | 'forbidden'
  | 'expired'
  | 'already_finalized'
  | 'not_uploaded'
  | 'size_mismatch'
  | 'type_mismatch'

export interface IngestedIntent {
  intent: typeof uploadIntents.$inferSelect
  sha256: string
}

export async function ingestIntent(
  db: DbOrTx,
  store: ObjectStore,
  actor: Actor,
  intentId: string,
  signal: AbortSignal,
  now: Date,
): Promise<Result<IngestedIntent, FinalizeError>> {
  const [intent] = await db.select().from(uploadIntents).where(eq(uploadIntents.id, intentId))
  if (intent === undefined || intent.userId !== actor.userId) return err('forbidden')
  if (intent.finalizedAt !== null) return err('already_finalized')
  if (intent.expiresAt.getTime() < now.getTime()) {
    await store.delete(intent.tempKey, signal)
    return err('expired')
  }
  const ingested = await ingestTempObject(
    db,
    store,
    {
      tempKey: intent.tempKey,
      declaredType: intent.contentType as AllowedType,
      declaredSize: intent.sizeBytes,
    },
    signal,
  )
  if (!ingested.ok) return err(ingested.error === 'not_found' ? 'not_uploaded' : ingested.error)
  return ok({ intent, sha256: ingested.value.sha256 })
}

export async function claimIntent(tx: Tx, intentId: string): Promise<boolean> {
  const claimed = await tx
    .update(uploadIntents)
    .set({ finalizedAt: new Date() })
    .where(and(eq(uploadIntents.id, intentId), isNull(uploadIntents.finalizedAt)))
    .returning({ id: uploadIntents.id })
  return claimed.length > 0
}

async function mayPublish(tx: Tx, actor: Actor, signal: AbortSignal): Promise<boolean> {
  return await hasCapability(tx, actor.userId, 'document.publish', signal)
}

export async function finalizeUpload(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: { intentId: string; isPublic?: boolean },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ documentId: string; versionId: string }, FinalizeError>> {
  signal.throwIfAborted()
  return await transactionResult<{ documentId: string; versionId: string }, FinalizeError>(
    db,
    async (tx) => {
      const ingested = await ingestIntent(tx, store, actor, input.intentId, signal, now)
      if (!ingested.ok) return err(ingested.error)
      const { intent, sha256 } = ingested.value
      const target = { kind: intent.targetKind, id: intent.targetId } as RecordRef
      const itemKey = target.kind === 'application' ? intent.itemKey : null
      if (!(await mayUploadTo(tx, actor, { ...target, itemKey }, signal, now))) {
        return err('forbidden')
      }
      if (input.isPublic === true && !(await mayPublish(tx, actor, signal))) return err('forbidden')
      if (!(await claimIntent(tx, intent.id))) return err('already_finalized')
      const attached = await attachDocument(
        tx,
        actor,
        {
          target,
          title: intent.title,
          docKind: docKindFor(target.kind, intent.docKind),
          ...(intent.seriesKey === null ? {} : { seriesKey: intent.seriesKey }),
          ...(input.isPublic === undefined ? {} : { isPublic: input.isPublic }),
          file: { sha256, filename: intent.filename, contentType: intent.contentType },
        },
        signal,
      )
      if (itemKey !== null) {
        await insertItemLink(
          tx,
          actor,
          { applicationId: target.id, itemKey, documentId: attached.documentId },
          signal,
        )
      }
      return ok(attached)
    },
  )
}
