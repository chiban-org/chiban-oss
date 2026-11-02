import { and, desc, eq, isNull, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applicationSnapshots,
  applications,
  documents,
  type LegalHoldRow,
  legalHolds,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { applicationIdOfRecord } from '@/features/records/ancestry'
import { err, ok, type Result } from '@/types/result'

const MIN_REASON = 10

export interface HoldTarget {
  kind: 'project' | 'application' | 'document'
  id: string
}

export async function placeHold(
  db: DbOrTx,
  actor: Actor,
  input: { target: HoldTarget; reason: string },
  signal: AbortSignal,
): Promise<Result<{ holdId: string }, 'forbidden' | 'reason_required'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'hold.place_release', signal)
  if (!allowed.ok) return err('forbidden')
  const reason = input.reason.trim()
  if (reason.length < MIN_REASON) return err('reason_required')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .insert(legalHolds)
      .values({
        targetKind: input.target.kind,
        targetId: input.target.id,
        reason,
        placedBy: actor.userId,
      })
      .returning({ id: legalHolds.id })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'hold.place',
        entityType: input.target.kind,
        entityId: input.target.id,
        after: { holdId: row?.id, reason },
      },
      signal,
    )
    return ok({ holdId: row?.id ?? '' })
  })
}

export async function releaseHold(
  db: DbOrTx,
  actor: Actor,
  input: { holdId: string; reason: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'reason_required' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'hold.place_release', signal)
  if (!allowed.ok) return err('forbidden')
  const reason = input.reason.trim()
  if (reason.length < MIN_REASON) return err('reason_required')
  return await transactionResult(db, async (tx) => {
    const [row] = await tx
      .update(legalHolds)
      .set({ releasedBy: actor.userId, releasedAt: new Date(), releaseReason: reason })
      .where(and(eq(legalHolds.id, input.holdId), isNull(legalHolds.releasedAt)))
      .returning({ targetKind: legalHolds.targetKind, targetId: legalHolds.targetId })
    if (row === undefined) return err('not_found')
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'hold.release',
        entityType: row.targetKind,
        entityId: row.targetId,
        after: { holdId: input.holdId, reason },
      },
      signal,
    )
    return ok(undefined)
  })
}

interface Lineage {
  documentId: string | null
  applicationId: string | null
  projectId: string | null
}

async function lineageOf(
  db: DbOrTx,
  ref: { kind: 'document' | 'application_snapshot'; id: string },
): Promise<Lineage> {
  if (ref.kind === 'application_snapshot') {
    const [row] = await db
      .select({ applicationId: applications.id, projectId: applications.projectId })
      .from(applicationSnapshots)
      .innerJoin(applications, eq(applications.id, applicationSnapshots.applicationId))
      .where(eq(applicationSnapshots.id, ref.id))
    return {
      documentId: null,
      applicationId: row?.applicationId ?? null,
      projectId: row?.projectId ?? null,
    }
  }
  const [doc] = await db.select().from(documents).where(eq(documents.id, ref.id))
  if (doc === undefined) return { documentId: null, applicationId: null, projectId: null }
  if (doc.recordKind === 'project') {
    return { documentId: doc.id, applicationId: null, projectId: doc.recordId }
  }
  const applicationId = await applicationIdOfRecord(db, doc)
  if (applicationId !== null) {
    const [app] = await db
      .select({ projectId: applications.projectId })
      .from(applications)
      .where(eq(applications.id, applicationId))
    return { documentId: doc.id, applicationId, projectId: app?.projectId ?? null }
  }
  return { documentId: doc.id, applicationId: null, projectId: null }
}

export async function holdsCovering(
  db: DbOrTx,
  ref: { kind: 'document' | 'application_snapshot'; id: string },
  signal: AbortSignal,
): Promise<LegalHoldRow[]> {
  signal.throwIfAborted()
  const lineage = await lineageOf(db, ref)
  const targets = [
    lineage.documentId === null
      ? null
      : and(eq(legalHolds.targetKind, 'document'), eq(legalHolds.targetId, lineage.documentId)),
    lineage.applicationId === null
      ? null
      : and(
          eq(legalHolds.targetKind, 'application'),
          eq(legalHolds.targetId, lineage.applicationId),
        ),
    lineage.projectId === null
      ? null
      : and(eq(legalHolds.targetKind, 'project'), eq(legalHolds.targetId, lineage.projectId)),
  ].filter((t) => t !== null)
  if (targets.length === 0) return []
  return await db
    .select()
    .from(legalHolds)
    .where(and(isNull(legalHolds.releasedAt), or(...targets)))
}

export async function listHolds(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<Result<LegalHoldRow[], 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'hold.place_release', signal)
  if (!allowed.ok) return err('forbidden')
  return ok(await db.select().from(legalHolds).orderBy(desc(legalHolds.placedAt)))
}

export async function applicationHolds(
  db: DbOrTx,
  applicationId: string,
  projectId: string,
): Promise<LegalHoldRow[]> {
  return await db
    .select()
    .from(legalHolds)
    .where(
      and(
        isNull(legalHolds.releasedAt),
        or(
          and(eq(legalHolds.targetKind, 'application'), eq(legalHolds.targetId, applicationId)),
          and(eq(legalHolds.targetKind, 'project'), eq(legalHolds.targetId, projectId)),
        ),
      ),
    )
}
