import { and, asc, count, eq, gt, inArray, lt } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, inspections, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { mayReadDay } from '@/features/inspections/dayList'
import { inspectionTypeLabel } from '@/features/inspections/siteInfo'
import { inspectionVisibleTo } from '@/features/inspections/visibility'
import type { CivilDate } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

const BOOKED = ['scheduled', 'passed', 'failed'] as const

export interface MissingResultRow {
  inspectionId: string
  scheduledDate: CivilDate
  typeLabel: string
  applicationNumber: string
}

export interface InspectorDay {
  inspectorUserId: string
  date: CivilDate
}

function missingWhere(actor: Actor, inspectorUserId: string, today: CivilDate) {
  return and(
    eq(inspections.inspectorUserId, inspectorUserId),
    eq(inspections.status, 'scheduled'),
    lt(inspections.scheduledDate, today),
    inspectionVisibleTo(actor),
  )
}

export async function listMissingResults(
  db: DbOrTx,
  actor: Actor,
  input: { inspectorUserId: string; today: CivilDate; limit: number },
  signal: AbortSignal,
): Promise<Result<{ rows: MissingResultRow[]; total: number }, 'forbidden'>> {
  signal.throwIfAborted()
  if (!(await mayReadDay(db, actor, input.inspectorUserId, signal))) return err('forbidden')
  const where = missingWhere(actor, input.inspectorUserId, input.today)
  const [rows, [total]] = await Promise.all([
    db
      .select({
        inspectionId: inspections.id,
        scheduledDate: inspections.scheduledDate,
        inspectionType: inspections.inspectionType,
        applicationNumber: applications.number,
      })
      .from(inspections)
      .innerJoin(applications, eq(applications.id, inspections.applicationId))
      .where(where)
      .orderBy(asc(inspections.scheduledDate), asc(inspections.startMinute), asc(inspections.id))
      .limit(input.limit),
    db.select({ n: count() }).from(inspections).where(where),
  ])
  return ok({
    rows: rows.map((row) => ({
      inspectionId: row.inspectionId,
      scheduledDate: row.scheduledDate as CivilDate,
      typeLabel: inspectionTypeLabel(row.inspectionType),
      applicationNumber: row.applicationNumber,
    })),
    total: total?.n ?? 0,
  })
}

export async function countStopsOn(
  db: DbOrTx,
  actor: Actor,
  input: InspectorDay,
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ n: count() })
    .from(inspections)
    .where(
      and(
        eq(inspections.inspectorUserId, input.inspectorUserId),
        eq(inspections.scheduledDate, input.date),
        inArray(inspections.status, [...BOOKED]),
        inspectionVisibleTo(actor),
      ),
    )
  return row?.n ?? 0
}

export async function upcomingInspectionDays(
  db: DbOrTx,
  actor: Actor,
  input: InspectorDay & { limit: number },
  signal: AbortSignal,
): Promise<{ date: CivilDate; count: number }[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({ date: inspections.scheduledDate, n: count() })
    .from(inspections)
    .where(
      and(
        eq(inspections.inspectorUserId, input.inspectorUserId),
        gt(inspections.scheduledDate, input.date),
        eq(inspections.status, 'scheduled'),
        inspectionVisibleTo(actor),
      ),
    )
    .groupBy(inspections.scheduledDate)
    .orderBy(asc(inspections.scheduledDate))
    .limit(input.limit)
  return rows.map((row) => ({ date: row.date as CivilDate, count: row.n }))
}

export async function countRequestedInspections(
  db: DbOrTx,
  actor: Actor,
  signal: AbortSignal,
): Promise<number> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ n: count() })
    .from(inspections)
    .where(and(eq(inspections.status, 'requested'), inspectionVisibleTo(actor)))
  return row?.n ?? 0
}

export async function stopsByInspectorOn(
  db: DbOrTx,
  actor: Actor,
  date: CivilDate,
  signal: AbortSignal,
): Promise<{ inspectorUserId: string; name: string; count: number }[]> {
  signal.throwIfAborted()
  const rows = await db
    .select({ inspectorUserId: users.id, name: users.displayName, n: count() })
    .from(inspections)
    .innerJoin(users, eq(users.id, inspections.inspectorUserId))
    .where(
      and(
        eq(inspections.scheduledDate, date),
        inArray(inspections.status, [...BOOKED]),
        inspectionVisibleTo(actor),
      ),
    )
    .groupBy(users.id, users.displayName)
    .orderBy(asc(users.displayName), asc(users.id))
  return rows.map((row) => ({ inspectorUserId: row.inspectorUserId, name: row.name, count: row.n }))
}
