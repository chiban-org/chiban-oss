import type { Tx } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { packRoles } from '@/features/packs/roles'
import { buildResponseLetter, type LetterOccasion } from '@/features/rtk/responseLetter'
import type { ObjectStore } from '@/features/storage/objectStore'

export interface LetterContext {
  store: ObjectStore
  actor: Actor
  signal: AbortSignal
  now?: Date
}

export async function fileRequestLetter(
  tx: Tx,
  context: LetterContext,
  letter: { requestId: string; title: string; filename: string; occasion?: LetterOccasion },
): Promise<string> {
  const bytes = await buildResponseLetter(tx, letter.requestId, context.signal, {
    ...(letter.occasion === undefined ? {} : { occasion: letter.occasion }),
    ...(context.now === undefined ? {} : { now: context.now }),
  })
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
      seriesKey: packRoles().recordSeries.rtkCorrespondence,
    },
    context.signal,
  )
  return attached.documentId
}
