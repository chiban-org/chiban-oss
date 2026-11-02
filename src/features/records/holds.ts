import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applicationSnapshots,
  applications,
  documents,
  enforcementCases,
  type LegalHoldRow,
  legalHolds,
  projects,
  rtkRequests,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { applicationIdOfRecord } from '@/features/records/ancestry'
import { err, ok, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

const MIN_REASON = 10

export interface HoldTarget {
  kind: 'project' | 'application' | 'document' | 'enforcement_case' | 'rtk_request'
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
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('records.disposition'))`)
    const [row] = await tx
      .insert(legalHolds)
      .values({
        targetKind: input.target.kind,
        targetId: input.target.id,
        reason,
        placedBy: actor.userId,
        placedAt: sql`clock_timestamp()`,
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

async function resolveHoldReference(
  db: DbOrTx,
  kind: HoldTarget['kind'],
  reference: string,
): Promise<Result<string, 'not_found' | 'ambiguous'>> {
  const ref = reference.trim()
  if (ref === '') return err('not_found')
  if (isUuid(ref)) return ok(ref)
  const matches: string[] =
    kind === 'application'
      ? (
          await db
            .select({ id: applications.id })
            .from(applications)
            .where(sql`lower(${applications.number}) = lower(${ref})`)
        ).map((r) => r.id)
      : kind === 'project'
        ? (
            await db
              .select({ id: projects.id })
              .from(projects)
              .where(sql`lower(${projects.title}) = lower(${ref})`)
          ).map((r) => r.id)
        : kind === 'enforcement_case'
          ? (
              await db
                .select({ id: enforcementCases.id })
                .from(enforcementCases)
                .where(sql`lower(${enforcementCases.number}) = lower(${ref})`)
            ).map((r) => r.id)
          : kind === 'rtk_request'
            ? (
                await db
                  .select({ id: rtkRequests.id })
                  .from(rtkRequests)
                  .where(sql`lower(${rtkRequests.number}) = lower(${ref})`)
              ).map((r) => r.id)
            : (
                await db
                  .select({ id: documents.id })
                  .from(documents)
                  .where(sql`lower(${documents.title}) = lower(${ref})`)
              ).map((r) => r.id)
  if (matches.length > 1) return err('ambiguous')
  const [only] = matches
  return only === undefined ? err('not_found') : ok(only)
}

export async function placeHoldByReference(
  db: DbOrTx,
  actor: Actor,
  input: { kind: HoldTarget['kind']; reference: string; reason: string },
  signal: AbortSignal,
): Promise<
  Result<{ holdId: string }, 'forbidden' | 'reason_required' | 'not_found' | 'ambiguous'>
> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'hold.place_release', signal)
  if (!allowed.ok) return err('forbidden')
  const resolved = await resolveHoldReference(db, input.kind, input.reference)
  if (!resolved.ok) return resolved
  return await placeHold(
    db,
    actor,
    { target: { kind: input.kind, id: resolved.value }, reason: input.reason },
    signal,
  )
}

export async function holdSubjects(
  db: DbOrTx,
  holds: LegalHoldRow[],
): Promise<Map<string, string>> {
  const idsOf = (kind: HoldTarget['kind']) =>
    holds.filter((h) => h.targetKind === kind).map((h) => h.targetId)
  const [apps, projs, docs, cases, requests] = await Promise.all([
    idsOf('application').length === 0
      ? []
      : db
          .select({ id: applications.id, label: applications.number })
          .from(applications)
          .where(inArray(applications.id, idsOf('application'))),
    idsOf('project').length === 0
      ? []
      : db
          .select({ id: projects.id, label: projects.title })
          .from(projects)
          .where(inArray(projects.id, idsOf('project'))),
    idsOf('document').length === 0
      ? []
      : db
          .select({ id: documents.id, label: documents.title })
          .from(documents)
          .where(inArray(documents.id, idsOf('document'))),
    idsOf('enforcement_case').length === 0
      ? []
      : db
          .select({ id: enforcementCases.id, label: enforcementCases.number })
          .from(enforcementCases)
          .where(inArray(enforcementCases.id, idsOf('enforcement_case'))),
    idsOf('rtk_request').length === 0
      ? []
      : db
          .select({ id: rtkRequests.id, label: rtkRequests.number })
          .from(rtkRequests)
          .where(inArray(rtkRequests.id, idsOf('rtk_request'))),
  ])
  const labels = new Map(
    [...apps, ...projs, ...docs, ...cases, ...requests].map((r) => [r.id, r.label]),
  )
  return new Map(holds.map((h) => [h.id, labels.get(h.targetId) ?? h.targetId]))
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
  enforcementCaseId: string | null
  rtkRequestId: string | null
}

const NO_LINEAGE: Lineage = {
  documentId: null,
  applicationId: null,
  projectId: null,
  enforcementCaseId: null,
  rtkRequestId: null,
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
      ...NO_LINEAGE,
      applicationId: row?.applicationId ?? null,
      projectId: row?.projectId ?? null,
    }
  }
  const [doc] = await db.select().from(documents).where(eq(documents.id, ref.id))
  if (doc === undefined) return NO_LINEAGE
  if (doc.recordKind === 'project') {
    return { ...NO_LINEAGE, documentId: doc.id, projectId: doc.recordId }
  }
  if (doc.recordKind === 'enforcement_case') {
    return { ...NO_LINEAGE, documentId: doc.id, enforcementCaseId: doc.recordId }
  }
  if (doc.recordKind === 'rtk_request') {
    return { ...NO_LINEAGE, documentId: doc.id, rtkRequestId: doc.recordId }
  }
  const applicationId = await applicationIdOfRecord(db, doc)
  if (applicationId !== null) {
    const [app] = await db
      .select({ projectId: applications.projectId })
      .from(applications)
      .where(eq(applications.id, applicationId))
    return { ...NO_LINEAGE, documentId: doc.id, applicationId, projectId: app?.projectId ?? null }
  }
  return { ...NO_LINEAGE, documentId: doc.id }
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
    lineage.enforcementCaseId === null
      ? null
      : and(
          eq(legalHolds.targetKind, 'enforcement_case'),
          eq(legalHolds.targetId, lineage.enforcementCaseId),
        ),
    lineage.rtkRequestId === null
      ? null
      : and(
          eq(legalHolds.targetKind, 'rtk_request'),
          eq(legalHolds.targetId, lineage.rtkRequestId),
        ),
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
