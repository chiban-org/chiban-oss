import { and, eq, isNull } from 'drizzle-orm'
import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import { documentVersions, renditionApprovals } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { processPreservation } from '@/features/preservation/preserve'
import { requestRedaction } from '@/features/redaction/redactionJobs'
import { runRedactionJob } from '@/features/redaction/runRedactionJob'
import { approveRendition } from '@/features/renditions/approvals'
import type { ObjectStore } from '@/features/storage/objectStore'
import { LETTER_PHONE_BOX } from '@/test/redactionFixtures'

const signal = new AbortController().signal
export const EXPLANATION = 'The number is a private phone number that invades the owner privacy.'
export const STATEMENT = 'Reviewed every page against the redaction boxes.'

const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})

export async function redactedVersionOf(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  source: { documentId: string; versionId: string },
  purpose: 'public' | 'rtk_release' = 'public',
  rtkRequestId?: string,
): Promise<string> {
  const requested = await requestRedaction(
    db,
    actor,
    {
      documentId: source.documentId,
      sourceVersionId: source.versionId,
      purpose,
      ...(rtkRequestId === undefined ? {} : { rtkRequestId }),
      boxes: [{ pdf: LETTER_PHONE_BOX, exemptionKey: 'nh.rtk.91a5.iv', explanation: EXPLANATION }],
    },
    signal,
  )
  if (!requested.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `redaction request failed: ${requested.error}`)
  const ran = await runRedactionJob(db, store, converter, { jobId: requested.value.jobId }, signal)
  if (!ran.ok || ran.value !== 'complete')
    throw new AppError(ErrorIds.DB_INVARIANT, 'redaction did not complete')
  const [version] = await db
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .where(eq(documentVersions.redactionJobId, requested.value.jobId))
  return version?.id ?? ''
}

export async function activePublicApproval(db: Db, documentId: string) {
  const [row] = await db
    .select()
    .from(renditionApprovals)
    .where(
      and(
        eq(renditionApprovals.documentId, documentId),
        eq(renditionApprovals.purpose, 'public'),
        isNull(renditionApprovals.revokedAt),
      ),
    )
  return row ?? null
}

export async function approvePublic(
  db: Db,
  actor: Actor,
  versionId: string,
  store: ObjectStore,
): Promise<string> {
  await processPreservation(db, store, converter, signal, 200)
  const approved = await approveRendition(
    db,
    actor,
    { versionId, purpose: 'public', reviewStatement: 'Fixture approval after staff review.' },
    signal,
  )
  if (!approved.ok)
    throw new AppError(ErrorIds.DB_INVARIANT, `fixture approval failed: ${approved.error}`)
  return approved.value.approvalId
}
