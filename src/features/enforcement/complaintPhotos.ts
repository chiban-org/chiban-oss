import type { Tx } from '@/db/client'
import { attachDocument } from '@/features/documents/attach'
import type { DocumentActor } from '@/features/documents/types'
import { storeGeneratedBytes } from '@/features/files/ingest'
import type { ObjectStore } from '@/features/storage/objectStore'

export interface CleanPhoto {
  bytes: Uint8Array
  type: 'image/jpeg' | 'image/png'
}

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const

export async function attachComplaintPhotos(
  tx: Tx,
  store: ObjectStore,
  input: { caseId: string; photos: CleanPhoto[]; actor: DocumentActor },
  signal: AbortSignal,
): Promise<void> {
  for (const [index, photo] of input.photos.entries()) {
    const stored = await storeGeneratedBytes(tx, store, photo.bytes, photo.type, signal)
    await attachDocument(
      tx,
      input.actor,
      {
        target: { kind: 'enforcement_case', id: input.caseId },
        title: `Complaint photo ${index + 1}`,
        docKind: 'enforcement_photo',
        file: {
          sha256: stored.sha256,
          filename: `photo-${index + 1}.${EXTENSIONS[photo.type]}`,
          contentType: photo.type,
        },
      },
      signal,
    )
  }
}
