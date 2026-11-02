import { eq } from 'drizzle-orm'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db, Tx } from '@/db/client'
import { applications } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { type TransitionError, transitionApplication } from '@/features/applications/transition'
import type { Actor } from '@/features/auth/actor'
import { attachDocument } from '@/features/documents/attach'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { buildPermitPdf } from '@/features/permits/permitDocuments'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export interface IssueDeps {
  store?: ObjectStore
  now?: Date
}

export async function issueInTransaction(
  tx: Tx,
  actor: Actor,
  input: { applicationId: string; expectedRowVersion?: number },
  signal: AbortSignal,
  deps: IssueDeps = {},
): Promise<Result<{ documentId: string }, TransitionError>> {
  const [row] = await tx
    .select({ rowVersion: applications.rowVersion, number: applications.number })
    .from(applications)
    .where(eq(applications.id, input.applicationId))
  const moved = await transitionApplication(
    tx,
    actor,
    {
      applicationId: input.applicationId,
      to: 'issued',
      expectedRowVersion: input.expectedRowVersion ?? row?.rowVersion ?? 0,
    },
    signal,
    deps.now,
  )
  if (!moved.ok) return err(moved.error)
  const pdf = await buildPermitPdf(tx, input.applicationId, signal)
  if (!pdf.ok) {
    throw new AppError(ErrorIds.DB_INVARIANT, 'An issued permit could not be rendered', {
      applicationId: input.applicationId,
    })
  }
  const store = deps.store ?? getObjectStore()
  const stored = await storeGeneratedBytes(tx, store, pdf.value, 'application/pdf', signal)
  const attached = await attachDocument(
    tx,
    actor,
    {
      target: { kind: 'application', id: input.applicationId },
      title: `Permit ${row?.number ?? ''}`.trim(),
      docKind: 'issued_permit',
      file: {
        sha256: stored.sha256,
        filename: `${row?.number ?? 'permit'}-permit.pdf`,
        contentType: 'application/pdf',
      },
      audiences: ['project_parties'],
      isPublic: false,
    },
    signal,
  )
  return ok({ documentId: attached.documentId })
}

export async function issueApplication(
  db: Db,
  actor: Actor,
  input: { applicationId: string; expectedRowVersion?: number },
  signal: AbortSignal,
  deps: IssueDeps = {},
): Promise<Result<{ documentId: string }, TransitionError>> {
  signal.throwIfAborted()
  return await transactionResult(db, (tx) => issueInTransaction(tx, actor, input, signal, deps))
}
