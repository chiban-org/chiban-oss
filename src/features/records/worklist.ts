import type { RecordSeries } from '@packs/nh/schema'
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { applicationSnapshots, applications, documents, retentionAssignments } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { loadPack } from '@/features/packs/loadPack'
import type { RetentionStatus } from '@/features/records/computeRetention'
import { retentionFor } from '@/features/records/disposition'
import type { CivilDate } from '@/types/civilDate'

export type WorklistState = 'eligible' | 'awaiting_event' | 'on_hold'

export interface WorklistRow {
  ref: { kind: 'document' | 'application_snapshot'; id: string }
  title: string
  series: { key: string; label: string; citation: RecordSeries['citation'] }
  status: RetentionStatus
  holds: number
}

const BATCH = 100
const CursorSchema = z.object({
  kind: z.enum(['document', 'application_snapshot']),
  id: z.string().uuid(),
})

function decodeCursor(cursor: string | undefined) {
  if (cursor === undefined) return null
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')))
  } catch {
    return null
  }
}

function encodeCursor(ref: WorklistRow['ref']): string {
  return Buffer.from(JSON.stringify(ref)).toString('base64url')
}

function stateOf(
  found: NonNullable<Awaited<ReturnType<typeof retentionFor>>>,
  asOf: CivilDate,
): WorklistState | null {
  const { status, holds } = found
  if (status.state === 'permanent') return null
  if (holds.length > 0) return 'on_hold'
  if (status.state === 'not_yet_triggered') return 'awaiting_event'
  return status.date <= asOf ? 'eligible' : null
}

async function titlesFor(db: Db, refs: WorklistRow['ref'][]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const docIds = refs.filter((r) => r.kind === 'document').map((r) => r.id)
  const snapIds = refs.filter((r) => r.kind === 'application_snapshot').map((r) => r.id)
  if (docIds.length > 0) {
    const rows = await db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(inArray(documents.id, docIds))
    for (const r of rows) titles.set(r.id, r.title)
  }
  if (snapIds.length > 0) {
    const rows = await db
      .select({
        id: applicationSnapshots.id,
        sequence: applicationSnapshots.sequence,
        number: applications.number,
      })
      .from(applicationSnapshots)
      .innerJoin(applications, eq(applications.id, applicationSnapshots.applicationId))
      .where(inArray(applicationSnapshots.id, snapIds))
    for (const r of rows) titles.set(r.id, `Application ${r.number}, snapshot ${r.sequence}`)
  }
  return titles
}

export async function retentionWorklist(
  db: Db,
  actor: Actor,
  input: { asOf: CivilDate; state: WorklistState; limit: number; cursor?: string },
  signal: AbortSignal,
): Promise<{ rows: WorklistRow[]; nextCursor: string | null }> {
  signal.throwIfAborted()
  const mayView =
    (await hasCapability(db, actor.userId, 'disposition.approve', signal)) ||
    (await hasCapability(db, actor.userId, 'disposition.propose', signal))
  if (!mayView) return { rows: [], nextCursor: null }
  const limit = Math.min(Math.max(Math.trunc(input.limit), 1), 200)
  const permanent = loadPack()
    .recordSeries.filter((s) => s.retention.kind === 'permanent')
    .map((s) => s.key)
  let after = decodeCursor(input.cursor)
  const matched: Omit<WorklistRow, 'title'>[] = []
  for (;;) {
    signal.throwIfAborted()
    const batch = await db
      .select({ kind: retentionAssignments.recordKind, id: retentionAssignments.recordId })
      .from(retentionAssignments)
      .where(
        and(
          isNull(retentionAssignments.supersededAt),
          permanent.length === 0
            ? undefined
            : notInArray(retentionAssignments.seriesKey, permanent),
          after === null
            ? undefined
            : sql`(${retentionAssignments.recordKind}, ${retentionAssignments.recordId}) > (${after.kind}, ${after.id}::uuid)`,
        ),
      )
      .orderBy(asc(retentionAssignments.recordKind), asc(retentionAssignments.recordId))
      .limit(BATCH)
    for (const ref of batch) {
      const found = await retentionFor(db, ref, signal)
      if (found === null || stateOf(found, input.asOf) !== input.state) continue
      matched.push({
        ref,
        series: {
          key: found.series.key,
          label: found.series.label,
          citation: found.series.citation,
        },
        status: found.status,
        holds: found.holds.length,
      })
      if (matched.length > limit) break
    }
    const last = batch.at(-1)
    if (matched.length > limit || last === undefined || batch.length < BATCH) break
    after = { kind: last.kind, id: last.id }
  }
  const page = matched.slice(0, limit)
  const titles = await titlesFor(
    db,
    page.map((r) => r.ref),
  )
  const lastRow = page.at(-1)
  return {
    rows: page.map((r) => ({ ...r, title: titles.get(r.ref.id) ?? r.ref.id })),
    nextCursor: matched.length > limit && lastRow !== undefined ? encodeCursor(lastRow.ref) : null,
  }
}
