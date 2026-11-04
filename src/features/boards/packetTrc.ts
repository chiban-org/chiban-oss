import type { Db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { TRC_SUMMARY_TITLE } from '@/features/boards/packetCandidates'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { trcSummaryPdf } from '@/features/reviews/trcSummary'
import type { ObjectStore } from '@/features/storage/objectStore'

export async function makeTrcSummaries(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: { applicationIds: string[]; signal: AbortSignal },
): Promise<string[]> {
  const { signal } = input
  const made: string[] = []
  for (const applicationId of new Set(input.applicationIds)) {
    const pdf = await trcSummaryPdf(db, actor, applicationId, signal)
    if (!pdf.ok) continue
    const attached = await db.transaction(async (tx) => {
      const stored = await storeGeneratedBytes(tx, store, pdf.value, 'application/pdf', signal)
      return await attachDocument(
        tx,
        actor,
        {
          target: { kind: 'application', id: applicationId },
          title: TRC_SUMMARY_TITLE,
          docKind: 'board_material',
          file: {
            sha256: stored.sha256,
            filename: 'trc-summary.pdf',
            contentType: 'application/pdf',
          },
          audiences: ['board'],
          isPublic: false,
        },
        signal,
      )
    })
    made.push(attached.documentId)
  }
  return made
}
