import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { documents, documentVersions } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { AUDIENCES, type Audience } from '@/features/documents/types'
import { claimIntent, ingestIntent } from '@/features/documents/uploads'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export async function setPublic(
  db: Db,
  actor: Actor,
  input: { documentId: string; isPublic: boolean },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.publish', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult(db, async (tx) => {
    const changed = await tx
      .update(documents)
      .set({ isPublic: input.isPublic, publicChangedBy: actor.userId, publicChangedAt: new Date() })
      .where(eq(documents.id, input.documentId))
      .returning({ id: documents.id })
    if (changed.length === 0) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: input.isPublic ? 'document.publish' : 'document.unpublish',
        entityType: 'document',
        entityId: input.documentId,
        after: { isPublic: input.isPublic },
      },
      signal,
    )
    return ok(undefined)
  })
}

export async function setAudiences(
  db: Db,
  actor: Actor,
  input: { documentId: string; audiences: Audience[] },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found' | 'invalid_audience'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.manage', signal)
  if (!allowed.ok) return err('forbidden')
  if (!input.audiences.every((a) => (AUDIENCES as readonly string[]).includes(a))) {
    return err('invalid_audience')
  }
  return await transactionResult(db, async (tx) => {
    const changed = await tx
      .update(documents)
      .set({ audiences: [...new Set(input.audiences)] })
      .where(eq(documents.id, input.documentId))
      .returning({ id: documents.id })
    if (changed.length === 0) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'document.audiences',
        entityType: 'document',
        entityId: input.documentId,
        after: { audiences: input.audiences },
      },
      signal,
    )
    return ok(undefined)
  })
}

export type RedactedError =
  | 'forbidden'
  | 'not_found'
  | 'expired'
  | 'already_finalized'
  | 'not_uploaded'
  | 'size_mismatch'
  | 'type_mismatch'

export async function uploadRedactedCopy(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: { documentId: string; intentId: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ versionId: string }, RedactedError>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.publish', signal)
  if (!allowed.ok) return err('forbidden')
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(eq(documents.id, input.documentId))
  if (doc === undefined) return err('not_found')
  const ingested = await ingestIntent(db, store, actor, input.intentId, signal, now)
  if (!ingested.ok) return err(ingested.error)
  const { intent, sha256 } = ingested.value
  return await transactionResult<{ versionId: string }, RedactedError>(db, async (tx) => {
    if (!(await claimIntent(tx, intent.id))) return err('already_finalized')
    const [version] = await tx
      .insert(documentVersions)
      .values({
        documentId: input.documentId,
        role: 'public_redacted',
        fileSha256: sha256,
        filename: intent.filename,
        contentType: intent.contentType,
        createdBy: actor.userId,
      })
      .returning({ id: documentVersions.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'document.redacted_copy',
        entityType: 'document',
        entityId: input.documentId,
        after: { versionId: version?.id, sha256 },
      },
      signal,
    )
    return ok({ versionId: version?.id ?? '' })
  })
}
