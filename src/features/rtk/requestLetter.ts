import type { Tx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { buildResponseLetter } from '@/features/rtk/responseLetter'
import type { ObjectStore } from '@/features/storage/objectStore'

export const RTK_LETTER_SERIES = 'nh.rs.correspondence_administrative'

export interface LetterContext {
  store: ObjectStore
  actor: Actor
  signal: AbortSignal
}

export async function fileRequestLetter(
  tx: Tx,
  context: LetterContext,
  letter: { requestId: string; title: string; filename: string },
): Promise<string> {
  const bytes = await buildResponseLetter(tx, letter.requestId, context.signal)
  const stored = await storeGeneratedBytes(
    tx,
    context.store,
    bytes,
    'application/pdf',
    context.signal,
  )
  const attached = await attachDocument(
    tx,
    context.actor,
    {
      target: { kind: 'rtk_request', id: letter.requestId },
      title: letter.title,
      docKind: 'rtk_letter',
      file: { sha256: stored.sha256, filename: letter.filename, contentType: 'application/pdf' },
      seriesKey: RTK_LETTER_SERIES,
    },
    context.signal,
  )
  return attached.documentId
}
