import type { RecordSeries } from '@packs/nh/schema'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applicationSnapshots,
  applications,
  documents,
  type LegalHoldRow,
  projects,
  recordEvents,
  retentionAssignments,
} from '@/db/schema'
import { applicationIdOfRecord } from '@/features/records/ancestry'
import { computeRetention, type RetentionStatus } from '@/features/records/computeRetention'
import { holdsCovering } from '@/features/records/holds'
import { requireSeries } from '@/features/records/series'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export interface DispositionRef {
  kind: 'document' | 'application_snapshot'
  id: string
}

const FALLBACK_ZONE = 'America/New_York'

async function recordCreatedAt(db: DbOrTx, ref: DispositionRef) {
  if (ref.kind === 'application_snapshot') {
    const [row] = await db
      .select({ at: applicationSnapshots.createdAt })
      .from(applicationSnapshots)
      .where(eq(applicationSnapshots.id, ref.id))
    return row?.at ?? null
  }
  const [row] = await db
    .select({ at: documents.createdAt })
    .from(documents)
    .where(eq(documents.id, ref.id))
  return row?.at ?? null
}

async function applicationIdOf(db: DbOrTx, ref: DispositionRef): Promise<string | null> {
  if (ref.kind === 'application_snapshot') {
    const [row] = await db
      .select({ id: applicationSnapshots.applicationId })
      .from(applicationSnapshots)
      .where(eq(applicationSnapshots.id, ref.id))
    return row?.id ?? null
  }
  const [doc] = await db.select().from(documents).where(eq(documents.id, ref.id))
  return doc === undefined ? null : await applicationIdOfRecord(db, doc)
}

async function caseIdOf(db: DbOrTx, ref: DispositionRef): Promise<string | null> {
  if (ref.kind !== 'document') return null
  const [doc] = await db
    .select({ recordKind: documents.recordKind, recordId: documents.recordId })
    .from(documents)
    .where(eq(documents.id, ref.id))
  return doc?.recordKind === 'enforcement_case' ? doc.recordId : null
}

async function projectIdsFor(db: DbOrTx, ref: DispositionRef): Promise<string[]> {
  if (ref.kind === 'application_snapshot') {
    const rows = await db
      .select({ id: applications.projectId })
      .from(applicationSnapshots)
      .innerJoin(applications, eq(applications.id, applicationSnapshots.applicationId))
      .where(eq(applicationSnapshots.id, ref.id))
    return rows.map((r) => r.id)
  }
  const [doc] = await db.select().from(documents).where(eq(documents.id, ref.id))
  if (doc === undefined) return []
  if (doc.recordKind === 'project') return [doc.recordId]
  if (doc.recordKind === 'parcel') {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.parcelId, doc.recordId))
    return rows.map((r) => r.id)
  }
  const applicationId = await applicationIdOfRecord(db, doc)
  if (applicationId === null) return []
  const rows = await db
    .select({ id: applications.projectId })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return rows.map((r) => r.id)
}

export async function retentionFor(
  db: DbOrTx,
  ref: DispositionRef,
  signal: AbortSignal,
): Promise<{
  series: RecordSeries
  status: RetentionStatus
  holds: LegalHoldRow[]
  events: { kind: string; occurredOn: CivilDate }[]
} | null> {
  signal.throwIfAborted()
  const [assignment] = await db
    .select()
    .from(retentionAssignments)
    .where(
      and(
        eq(retentionAssignments.recordKind, ref.kind),
        eq(retentionAssignments.recordId, ref.id),
        isNull(retentionAssignments.supersededAt),
      ),
    )
    .orderBy(desc(retentionAssignments.assignedAt))
  const createdAt = await recordCreatedAt(db, ref)
  if (assignment === undefined || createdAt === null) return null
  const series = requireSeries(assignment.seriesKey)
  const town = await getTownSettings(db, signal)
  const zone = town.ok ? town.value.timeZone : FALLBACK_ZONE
  const projectIds = await projectIdsFor(db, ref)
  const caseId = await caseIdOf(db, ref)
  const applicationId = await applicationIdOf(db, ref)
  const projectEvents =
    projectIds.length === 0
      ? []
      : await db
          .select()
          .from(recordEvents)
          .where(
            and(
              inArray(recordEvents.projectId, projectIds),
              applicationId === null
                ? undefined
                : or(
                    isNull(recordEvents.applicationId),
                    eq(recordEvents.applicationId, applicationId),
                  ),
            ),
          )
  const caseEvents =
    caseId === null
      ? []
      : await db.select().from(recordEvents).where(eq(recordEvents.caseId, caseId))
  const events = [...projectEvents, ...caseEvents]
  const status = computeRetention(series, {
    recordDate: todayInTimeZone(zone, createdAt),
    events: events.map((e) => ({ kind: e.kind, occurredOn: e.occurredOn as CivilDate })),
  })
  return {
    series,
    status,
    holds: await holdsCovering(db, ref, signal),
    events: events.map((e) => ({ kind: e.kind, occurredOn: e.occurredOn as CivilDate })),
  }
}

export type DispositionBlock =
  | 'on_hold'
  | 'permanent'
  | 'not_yet_triggered'
  | 'not_yet_eligible'
  | 'no_series'

export async function checkDisposition(
  db: DbOrTx,
  ref: DispositionRef,
  today: CivilDate,
  signal: AbortSignal,
): Promise<Result<void, DispositionBlock>> {
  const holds = await holdsCovering(db, ref, signal)
  if (holds.length > 0) return err('on_hold')
  const found = await retentionFor(db, ref, signal)
  if (found === null) return err('no_series')
  const { status } = found
  if (status.state === 'permanent') return err('permanent')
  if (status.state === 'not_yet_triggered') return err('not_yet_triggered')
  return status.date > today ? err('not_yet_eligible') : ok(undefined)
}
