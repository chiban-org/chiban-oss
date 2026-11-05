import { and, eq, isNull, ne } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Tx } from '@/db/client'
import { documents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { loadPermitData } from '@/features/permits/permitData'
import { renderPermit } from '@/features/permits/permitDocuments'
import type { ObjectStore } from '@/features/storage/objectStore'

export async function storeCorrectedPermit(
  tx: Tx,
  actor: Actor,
  target: { applicationId: string; store: ObjectStore },
  signal: AbortSignal,
): Promise<string> {
  const { applicationId, store } = target
  const data = await loadPermitData(tx, applicationId, signal)
  if (data === null || data.correctionMark === null) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'A corrected permit could not be rendered', {
      applicationId,
    })
  }
  const { number, permitRevision } = data.application
  const stored = await storeGeneratedBytes(
    tx,
    store,
    await renderPermit(tx, data, signal),
    'application/pdf',
    signal,
  )
  const attached = await attachDocument(
    tx,
    actor,
    {
      target: { kind: 'application', id: applicationId },
      title: `Permit ${number} (${data.correctionMark})`,
      docKind: 'issued_permit',
      file: {
        sha256: stored.sha256,
        filename: `${number}-permit-revision-${permitRevision}.pdf`,
        contentType: 'application/pdf',
      },
      audiences: ['project_parties'],
      isPublic: false,
    },
    signal,
  )
  await tx
    .update(documents)
    .set({ supersededBy: attached.documentId })
    .where(
      and(
        eq(documents.recordKind, 'application'),
        eq(documents.recordId, applicationId),
        eq(documents.docKind, 'issued_permit'),
        isNull(documents.supersededBy),
        ne(documents.id, attached.documentId),
      ),
    )
  return attached.documentId
}
