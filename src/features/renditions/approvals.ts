import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, Tx } from '@/db/client'
import {
  APPROVAL_PURPOSES,
  type ApprovalPurpose,
  documents,
  documentVersions,
  preservationRecords,
  renditionApprovals,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { deleteDerivedObjects, onApprovalRevoked } from '@/features/renditions/propagate'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

const MIN_REASON = 10

const PUBLIC_ROLES = ['original', 'public_redacted']
const RELEASE_ROLES = ['original', 'public_redacted', 'release_redacted']

const ApproveSchema = z.object({
  versionId: z.string().uuid(),
  purpose: z.enum(APPROVAL_PURPOSES),
  rtkRequestId: z.string().uuid().optional(),
  reviewStatement: z.string().trim().min(1).max(2000),
})

export async function mayManageApprovals(
  db: Tx | Db,
  userId: string,
  purpose: ApprovalPurpose,
  signal: AbortSignal,
): Promise<boolean> {
  if (await hasCapability(db, userId, 'document.publish', signal)) return true
  return purpose === 'rtk_release' && (await hasCapability(db, userId, 'rtk.manage', signal))
}

export async function revokeActive(
  tx: Tx,
  where: ReturnType<typeof and>,
  by: string | null,
  reason: string,
  at: Date,
): Promise<{ id: string; versionId: string; documentId: string }[]> {
  return await tx
    .update(renditionApprovals)
    .set({ revokedAt: at, revokedBy: by, revokeReason: reason })
    .where(and(where, isNull(renditionApprovals.revokedAt)))
    .returning({
      id: renditionApprovals.id,
      versionId: renditionApprovals.versionId,
      documentId: renditionApprovals.documentId,
    })
}

export async function insertSystemApproval(
  tx: Tx,
  input: { documentId: string; versionId: string; statement: string },
): Promise<void> {
  await tx
    .insert(renditionApprovals)
    .values({
      documentId: input.documentId,
      versionId: input.versionId,
      purpose: 'public',
      approvedByKind: 'system',
      reviewStatement: input.statement,
    })
    .onConflictDoNothing()
}

export type ApproveError = 'forbidden' | 'invalid' | 'not_found' | 'wrong_role' | 'not_ready'

export async function approveRendition(
  db: Db,
  actor: Actor,
  input: z.input<typeof ApproveSchema>,
  signal: AbortSignal,
  store?: ObjectStore,
): Promise<Result<{ approvalId: string }, ApproveError>> {
  signal.throwIfAborted()
  const parsed = ApproveSchema.safeParse(input)
  if (!parsed.success) return err('invalid')
  const value = parsed.data
  if (!(await mayManageApprovals(db, actor.userId, value.purpose, signal))) return err('forbidden')
  const staleKeys: string[] = []
  const result = await transactionResult<{ approvalId: string }, ApproveError>(db, async (tx) => {
    const [version] = await tx
      .select({ documentId: documentVersions.documentId, role: documentVersions.role })
      .from(documentVersions)
      .where(eq(documentVersions.id, value.versionId))
    if (version === undefined) return err('not_found')
    await tx
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, version.documentId))
      .for('update')
    const allowedRoles = value.purpose === 'public' ? PUBLIC_ROLES : RELEASE_ROLES
    if (!allowedRoles.includes(version.role)) return err('wrong_role')
    const [pending] = await tx
      .select({ id: preservationRecords.id })
      .from(preservationRecords)
      .where(
        and(
          eq(preservationRecords.originalVersionId, value.versionId),
          eq(preservationRecords.status, 'pending'),
        ),
      )
    if (pending !== undefined) return err('not_ready')
    const now = new Date()
    if (value.purpose === 'public') {
      const superseded = await revokeActive(
        tx,
        and(
          eq(renditionApprovals.documentId, version.documentId),
          eq(renditionApprovals.purpose, 'public'),
        ),
        actor.userId,
        'superseded',
        now,
      )
      for (const old of superseded) {
        staleKeys.push(
          ...(await onApprovalRevoked(
            tx,
            { approvalId: old.id, versionId: old.versionId, revokedAt: now },
            signal,
          )),
        )
      }
    }
    const [row] = await tx
      .insert(renditionApprovals)
      .values({
        documentId: version.documentId,
        versionId: value.versionId,
        purpose: value.purpose,
        rtkRequestId: value.rtkRequestId ?? null,
        approvedByKind: 'user',
        approvedBy: actor.userId,
        approvedAt: now,
        reviewStatement: value.reviewStatement,
      })
      .returning({ id: renditionApprovals.id })
    const approvalId = row?.id ?? ''
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'rendition.approved',
        entityType: 'document',
        entityId: version.documentId,
        after: { approvalId, versionId: value.versionId, purpose: value.purpose },
      },
      signal,
    )
    return ok({ approvalId })
  })
  if (result.ok) await deleteDerivedObjects(store, staleKeys, signal)
  return result
}

export type RevokeError =
  | 'forbidden'
  | 'invalid'
  | 'not_found'
  | 'reason_required'
  | 'already_revoked'

export async function revokeApproval(
  db: Db,
  actor: Actor,
  input: { approvalId: string; reason: string },
  signal: AbortSignal,
  store?: ObjectStore,
): Promise<Result<void, RevokeError>> {
  signal.throwIfAborted()
  if (!z.string().uuid().safeParse(input.approvalId).success) return err('invalid')
  const staleKeys: string[] = []
  const result = await transactionResult<void, RevokeError>(db, async (tx) => {
    const [approval] = await tx
      .select()
      .from(renditionApprovals)
      .where(eq(renditionApprovals.id, input.approvalId))
      .for('update')
    if (approval === undefined) return err('not_found')
    if (!(await mayManageApprovals(tx, actor.userId, approval.purpose, signal))) {
      return err('forbidden')
    }
    if (input.reason.trim().length < MIN_REASON) return err('reason_required')
    if (approval.revokedAt !== null) return err('already_revoked')
    const now = new Date()
    await revokeActive(
      tx,
      eq(renditionApprovals.id, approval.id),
      actor.userId,
      input.reason.trim(),
      now,
    )
    staleKeys.push(
      ...(await onApprovalRevoked(
        tx,
        { approvalId: approval.id, versionId: approval.versionId, revokedAt: now },
        signal,
      )),
    )
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'rendition.revoked',
        entityType: 'document',
        entityId: approval.documentId,
        after: { approvalId: approval.id, versionId: approval.versionId, reason: input.reason },
      },
      signal,
    )
    return ok(undefined)
  })
  if (result.ok) await deleteDerivedObjects(store, staleKeys, signal)
  return result
}
