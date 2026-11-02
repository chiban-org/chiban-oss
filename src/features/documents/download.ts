import type { DbOrTx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { type Rendition, resolveRendition } from '@/features/documents/visibility'
import type { Delivery } from '@/features/storage/delivery'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const DOWNLOAD_SECONDS = 60

export async function downloadDocument(
  db: DbOrTx,
  store: ObjectStore,
  actor: Actor | null,
  documentId: string,
  rendition: Rendition,
  signal: AbortSignal,
): Promise<Result<Delivery, 'not_found'>> {
  const resolved = await resolveRendition(db, actor, documentId, signal, rendition)
  if (!resolved.ok) return err('not_found')
  const { file, filename, contentType } = resolved.value
  if (resolved.value.viaPublicApproval) {
    return ok({ kind: 'stream', object: { storageKey: file.storageKey, filename, contentType } })
  }
  const url = await store.presignGet(file.storageKey, {
    expiresSeconds: DOWNLOAD_SECONDS,
    filename,
    contentType,
    disposition: 'inline',
  })
  return ok({ kind: 'redirect', url })
}
