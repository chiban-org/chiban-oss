import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { resolveRendition } from '@/features/documents/visibility'
import type { ObjectStore } from '@/features/storage/objectStore'

const signal = new AbortController().signal

export async function downloadObject(
  db: Db,
  store: ObjectStore,
  documentId: string,
): Promise<Uint8Array> {
  const resolved = await resolveRendition(
    db,
    { userId: 'test', kind: 'staff', roles: ['admin'] },
    documentId,
    signal,
  )
  if (!resolved.ok) throw new AppError(ErrorIds.DB_INVARIANT, 'document not found', { documentId })
  const url = await store.presignGet(resolved.value.file.storageKey, {
    expiresSeconds: 60,
    filename: resolved.value.filename,
    contentType: resolved.value.contentType,
    disposition: 'inline',
  })
  return new Uint8Array(await (await fetch(url)).arrayBuffer())
}
