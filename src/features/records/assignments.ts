import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { DbOrTx, Tx } from '@/db/client'
import {
  applicationSnapshots,
  applications,
  documents,
  documentVersions,
  inspections,
  preservationRecords,
  projects,
  recordEvents,
  retentionAssignments,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { loadApplicationContext } from '@/features/applications/context'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { type DocumentActor, isUserActor } from '@/features/documents/types'
import { defaultSeriesKey, findSeries, requireSeries } from '@/features/records/series'
import { outcomeSeriesKey, type SeriesOutcome } from '@/features/records/seriesSummary'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface RetentionRef {
  kind: 'document' | 'application_snapshot'
  id: string
}

type AssignReason = 'default' | 'outcome' | 'staff'

export async function assignSeries(
  tx: Tx,
  ref: RetentionRef,
  seriesKey: string,
  reason: AssignReason,
  actor: DocumentActor,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  const series = requireSeries(seriesKey)
  await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtext('records.disposition'))`)
  await tx
    .update(retentionAssignments)
    .set({ supersededAt: new Date() })
    .where(
      and(
        eq(retentionAssignments.recordKind, ref.kind),
        eq(retentionAssignments.recordId, ref.id),
        isNull(retentionAssignments.supersededAt),
      ),
    )
  await tx.insert(retentionAssignments).values({
    recordKind: ref.kind,
    recordId: ref.id,
    seriesKey: series.key,
    seriesVersion: series.version,
    reason,
    assignedByKind: isUserActor(actor) ? 'user' : 'system',
    assignedBy: isUserActor(actor) ? actor.userId : null,
  })
}

const SYSTEM_ACTOR = { kind: 'system', job: 'records.outcome' } as const

async function recordRegistrationExpiry(
  tx: Tx,
  applicationId: string,
  projectId: string,
  onDate: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  const context = await loadApplicationContext(tx, applicationId, signal)
  const classification = context?.typeBody.classification
  if (context === null || classification === undefined) return
  const key = defaultSeriesKey(classification, context.typeBody.key)
  const retention = key === null ? null : requireSeries(key).retention
  if (retention?.kind !== 'event' || !retention.events.includes('registration_expired')) return
  await tx.insert(recordEvents).values({
    projectId,
    applicationId,
    kind: 'registration_expired',
    occurredOn: onDate,
    recordedByKind: 'system',
  })
}

export async function applyOutcomeSeries(
  tx: Tx,
  applicationId: string,
  outcome: SeriesOutcome,
  onDate: CivilDate,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  const [app] = await tx
    .select({ projectId: applications.projectId })
    .from(applications)
    .where(eq(applications.id, applicationId))
  if (app === undefined) return
  if (outcome !== 'expired') {
    await tx.insert(recordEvents).values({
      projectId: app.projectId,
      applicationId,
      kind: outcome === 'withdrawn' ? 'application_withdrawn' : 'application_denied',
      occurredOn: onDate,
      recordedByKind: 'system',
    })
  }
  if (outcome === 'expired')
    await recordRegistrationExpiry(tx, applicationId, app.projectId, onDate, signal)
  const inspectionIds = (
    await tx
      .select({ id: inspections.id })
      .from(inspections)
      .where(eq(inspections.applicationId, applicationId))
  ).map((r) => r.id)
  const docIds = (
    await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        or(
          and(eq(documents.recordKind, 'application'), eq(documents.recordId, applicationId)),
          and(eq(documents.recordKind, 'inspection'), inArray(documents.recordId, inspectionIds)),
        ),
      )
  ).map((r) => r.id)
  const snapIds = (
    await tx
      .select({ id: applicationSnapshots.id })
      .from(applicationSnapshots)
      .where(eq(applicationSnapshots.applicationId, applicationId))
  ).map((r) => r.id)
  const current = await tx
    .select()
    .from(retentionAssignments)
    .where(
      and(
        isNull(retentionAssignments.supersededAt),
        inArray(retentionAssignments.recordId, [...docIds, ...snapIds, applicationId]),
      ),
    )
  for (const row of current) {
    const target = outcomeSeriesKey(requireSeries(row.seriesKey), outcome)
    if (target === null || target === row.seriesKey) continue
    await assignSeries(
      tx,
      { kind: row.recordKind, id: row.recordId },
      target,
      'outcome',
      SYSTEM_ACTOR,
      signal,
    )
  }
}

export async function recordBuildingRemoved(
  db: DbOrTx,
  actor: Actor,
  input: { projectId: string; occurredOn: CivilDate },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.manage', signal)
  if (!allowed.ok) return err('forbidden')
  return await transactionResult<void, 'not_found'>(db, async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, input.projectId))
    if (project === undefined) return err('not_found')
    await tx.insert(recordEvents).values({
      projectId: input.projectId,
      kind: 'building_removed',
      occurredOn: input.occurredOn,
      recordedByKind: 'user',
      recordedBy: actor.userId,
    })
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'record.building_removed',
        entityType: 'project',
        entityId: input.projectId,
        after: { occurredOn: input.occurredOn },
      },
      signal,
    )
    return ok(undefined)
  })
}

async function requirePreservation(tx: Tx, documentId: string): Promise<void> {
  const originals = tx
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.role, 'original')))
  await tx
    .update(preservationRecords)
    .set({ required: true, status: 'pending', updatedAt: new Date() })
    .where(
      and(
        eq(preservationRecords.status, 'not_required'),
        inArray(preservationRecords.originalVersionId, originals),
      ),
    )
}

export async function setDocumentSeries(
  db: DbOrTx,
  actor: Actor,
  input: { documentId: string; seriesKey: string },
  signal: AbortSignal,
): Promise<Result<void, 'forbidden' | 'unknown_series' | 'not_found'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'document.manage', signal)
  if (!allowed.ok) return err('forbidden')
  if (findSeries(input.seriesKey) === null) return err('unknown_series')
  return await transactionResult(db, async (tx) => {
    const [doc] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, input.documentId))
    if (doc === undefined) return err('not_found')
    await assignSeries(
      tx,
      { kind: 'document', id: doc.id },
      input.seriesKey,
      'staff',
      actor,
      signal,
    )
    if (requireSeries(input.seriesKey).preservation === 'pdfa') {
      await requirePreservation(tx, doc.id)
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'record.series',
        entityType: 'document',
        entityId: doc.id,
        after: { seriesKey: input.seriesKey },
      },
      signal,
    )
    return ok(undefined)
  })
}
