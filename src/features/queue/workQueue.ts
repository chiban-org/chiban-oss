import { and, asc, eq, inArray, isNull, ne, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, projects, reviewAssignments, users } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import { hasFullRecordAccess } from '@/features/access/roles'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { CoreState } from '@/features/applications/states'
import { substepLabel } from '@/features/applications/statusText'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { displayIdsFor } from '@/features/parcels/displayId'
import { townToday } from '@/features/town/today'
import { addDays, type CivilDate, daysBetween } from '@/types/civilDate'

const WARNING_DAYS = 5

export interface WorkQueueFilters {
  states?: CoreState[]
  typeKeys?: string[]
  assignedToMe?: boolean
  overdueOnly?: boolean
  awaitingPayment?: boolean
  numberContains?: string
}

export type DueStatus = 'overdue' | 'warning' | 'ok' | 'none'

export interface WorkQueueRow {
  applicationId: string
  number: string
  typeLabel: string
  state: CoreState
  substep: string | null
  substepLabel: string | null
  parcelDisplayId: string | null
  nextDue: CivilDate | null
  daysUntilDue: number | null
  dueStatus: DueStatus
  feesDueCents: number
  unknownPayment: boolean
  reviewers: { name: string; status: string }[]
  preservationIncomplete: boolean
}

const NEXT_DUE = sql<string | null>`(
  select min(c.current_due) from clocks c
  where c.application_id = ${applications.id} and c.status = 'running')`

const FEES_DUE = sql<number>`(
  select coalesce(sum(greatest(0, l.amt - coalesce(p.paid, 0))), 0)::int
  from (
    select distinct on (fa.stage) fa.stage, fa.computation
    from fee_assessments fa where fa.application_id = ${applications.id}
    order by fa.stage, fa.sequence desc
  ) latest
  cross join lateral (
    select e->>'code' as code, (e->'amount'->>'value')::int as amt
    from jsonb_array_elements(latest.computation->'lines') e
    where e->'amount' ? 'value'
  ) l
  left join (
    select la.stage, la.fee_code, sum(la.amount_cents) as paid
    from ledger_allocations la
    where la.application_id = ${applications.id} and la.target_kind = 'fee_assessment_line'
    group by la.stage, la.fee_code
  ) p on p.stage = latest.stage and p.fee_code = l.code)`

const UNKNOWN_PAYMENT = sql<boolean>`exists (
  select 1 from payment_attempts pa
  where pa.outcome_unknown and pa.state in ('pending', 'authorized')
    and pa.planned_allocations @> jsonb_build_array(jsonb_build_object('applicationId', ${applications.id}::text)))`

function preservationIncompleteFor(actor: Actor) {
  if (!hasFullRecordAccess(actor)) return sql<boolean>`false`
  return sql<boolean>`exists (
  select 1 from documents d
  join document_versions dv on dv.document_id = d.id
  join preservation_records pr on pr.original_version_id = dv.id
  where d.record_kind = 'application' and d.record_id = ${applications.id}
    and pr.status = 'incomplete')`
}

function dueStatusOf(nextDue: CivilDate | null, today: CivilDate): DueStatus {
  if (nextDue === null) return 'none'
  if (nextDue < today) return 'overdue'
  return nextDue <= addDays(today, WARNING_DAYS) ? 'warning' : 'ok'
}

function filterClauses(
  actor: Actor,
  filters: WorkQueueFilters,
  today: CivilDate,
): (SQL | undefined)[] {
  const states = filters.states
  return [
    applicationVisibleTo(actor),
    states === undefined ? ne(applications.state, 'draft') : inArray(applications.state, states),
    filters.typeKeys === undefined || filters.typeKeys.length === 0
      ? undefined
      : inArray(applications.applicationTypeKey, filters.typeKeys),
    filters.assignedToMe === true
      ? sql`exists (select 1 from review_assignments ra
          where ra.application_id = ${applications.id}
            and ra.reviewer_user_id = ${actor.userId} and ra.removed_at is null)`
      : undefined,
    filters.overdueOnly === true ? sql`${NEXT_DUE} < ${today}::date` : undefined,
    filters.awaitingPayment === true ? sql`${FEES_DUE} > 0` : undefined,
    filters.numberContains === undefined || filters.numberContains === ''
      ? undefined
      : sql`${applications.number} ilike ${`%${filters.numberContains.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`,
  ]
}

interface TypeLabels {
  label: string
  substeps: { key: string; label: string }[]
}

async function typeLabels(db: DbOrTx, pins: string[], signal: AbortSignal) {
  const labels = new Map<string, TypeLabels>()
  for (const id of new Set(pins)) {
    const version = await getVersion(db, id, signal)
    const body = version?.body as ApplicationTypeBody | undefined
    labels.set(id, {
      label: body?.label ?? '',
      substeps: body?.workflow.substeps ?? [],
    })
  }
  return labels
}

async function reviewersFor(db: DbOrTx, applicationIds: string[]) {
  if (applicationIds.length === 0) return new Map<string, { name: string; status: string }[]>()
  const rows = await db
    .select({
      applicationId: reviewAssignments.applicationId,
      name: users.displayName,
      status: reviewAssignments.status,
    })
    .from(reviewAssignments)
    .innerJoin(users, eq(users.id, reviewAssignments.reviewerUserId))
    .where(
      and(
        inArray(reviewAssignments.applicationId, applicationIds),
        isNull(reviewAssignments.removedAt),
      ),
    )
    .orderBy(asc(reviewAssignments.assignedAt))
  const byApp = new Map<string, { name: string; status: string }[]>()
  for (const r of rows) {
    byApp.set(r.applicationId, [
      ...(byApp.get(r.applicationId) ?? []),
      { name: r.name, status: r.status },
    ])
  }
  return byApp
}

export async function listWorkQueue(
  db: DbOrTx,
  actor: Actor,
  input: { filters: WorkQueueFilters; limit: number; cursor?: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<{ rows: WorkQueueRow[]; nextCursor: string | null; total: number }> {
  signal.throwIfAborted()
  const today = await townToday(db, now, signal)
  const where = and(...filterClauses(actor, input.filters, today))
  const offset = Math.max(0, Number(input.cursor ?? '0') || 0)
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(applications).where(where)
  const rows = await db
    .select({
      id: applications.id,
      number: applications.number,
      state: applications.state,
      substep: applications.substep,
      configPins: applications.configPins,
      parcelId: projects.parcelId,
      nextDue: NEXT_DUE,
      feesDue: FEES_DUE,
      unknownPayment: UNKNOWN_PAYMENT,
      preservationIncomplete: preservationIncompleteFor(actor),
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .where(where)
    .orderBy(
      sql`${NEXT_DUE} asc nulls last`,
      sql`${applications.receivedDate} asc nulls last`,
      asc(applications.id),
    )
    .limit(input.limit + 1)
    .offset(offset)
  const page = rows.slice(0, input.limit)
  const labels = await typeLabels(
    db,
    page.map((r) => (r.configPins as { applicationType: string }).applicationType),
    signal,
  )
  const display = await displayIdsFor(
    db,
    page.map((r) => r.parcelId),
  )
  const reviewers = await reviewersFor(
    db,
    page.map((r) => r.id),
  )
  return {
    rows: page.map((r) => {
      const nextDue = r.nextDue as CivilDate | null
      const type = labels.get((r.configPins as { applicationType: string }).applicationType)
      return {
        applicationId: r.id,
        number: r.number,
        typeLabel: type?.label ?? '',
        state: r.state as CoreState,
        substep: r.substep,
        substepLabel: r.substep === null ? null : substepLabel(r.substep, type?.substeps ?? []),
        parcelDisplayId: display.get(r.parcelId) ?? null,
        nextDue,
        daysUntilDue: nextDue === null ? null : daysBetween(today, nextDue),
        dueStatus: dueStatusOf(nextDue, today),
        feesDueCents: r.feesDue,
        unknownPayment: r.unknownPayment,
        reviewers: reviewers.get(r.id) ?? [],
        preservationIncomplete: r.preservationIncomplete,
      }
    }),
    nextCursor: rows.length > input.limit ? String(offset + input.limit) : null,
    total: count?.n ?? 0,
  }
}
