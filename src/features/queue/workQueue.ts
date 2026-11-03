import { and, asc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, projects, reviewAssignments, users } from '@/db/schema'
import { applicationVisibleTo } from '@/features/access/predicates'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { CoreState } from '@/features/applications/states'
import { substepLabel } from '@/features/applications/statusText'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { ruleLabel } from '@/features/packs/ruleLabel'
import { displayIdsFor } from '@/features/parcels/displayId'
import {
  FEES_DUE,
  FILING_DUE,
  NEXT_DUE,
  NEXT_DUE_RULE_KEY,
  NOTICE_DUE,
  preservationIncompleteFor,
  UNKNOWN_PAYMENT,
} from '@/features/queue/queueSql'
import { NEEDS_ACTION_STATES } from '@/features/queue/stateScopes'
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
  nextDueLabel: string | null
  daysUntilDue: number | null
  dueStatus: DueStatus
  noticeDue: CivilDate | null
  noticeOverdue: boolean
  filingDue: CivilDate | null
  filingOverdue: boolean
  feesDueCents: number
  unknownPayment: boolean
  reviewers: { name: string; status: string }[]
  preservationIncomplete: boolean
}

function dueStatusOf(nextDue: CivilDate | null, today: CivilDate): DueStatus {
  if (nextDue === null) return 'none'
  if (nextDue < today) return 'overdue'
  return nextDue <= addDays(today, WARNING_DAYS) ? 'warning' : 'ok'
}

const NEEDS_ACTION = sql`(${inArray(applications.state, [...NEEDS_ACTION_STATES])}
  or (${applications.state} <> 'draft'
    and (${NEXT_DUE} is not null or ${FILING_DUE} is not null or ${NOTICE_DUE} is not null)))`

function filterClauses(
  actor: Actor,
  filters: WorkQueueFilters,
  today: CivilDate,
): (SQL | undefined)[] {
  const states = filters.states
  return [
    applicationVisibleTo(actor),
    states === undefined ? NEEDS_ACTION : inArray(applications.state, states),
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

export async function countWorkQueue(
  db: DbOrTx,
  actor: Actor,
  filters: readonly WorkQueueFilters[],
  today: CivilDate,
  signal: AbortSignal,
): Promise<number[]> {
  signal.throwIfAborted()
  return await Promise.all(
    filters.map(async (f) => {
      const [count] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(applications)
        .where(and(...filterClauses(actor, f, today)))
      return count?.n ?? 0
    }),
  )
}

export interface WorkQueuePage {
  rows: WorkQueueRow[]
  offset: number
  prevCursor: string | null
  nextCursor: string | null
  total: number
}

function isPast(date: CivilDate | null, today: CivilDate): boolean {
  return date !== null && date < today
}

export async function listWorkQueue(
  db: DbOrTx,
  actor: Actor,
  input: { filters: WorkQueueFilters; limit: number; cursor?: string },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<WorkQueuePage> {
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
      nextDueRuleKey: NEXT_DUE_RULE_KEY,
      noticeDue: NOTICE_DUE,
      filingDue: FILING_DUE,
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
        nextDueLabel: r.nextDueRuleKey === null ? null : ruleLabel(r.nextDueRuleKey),
        daysUntilDue: nextDue === null ? null : daysBetween(today, nextDue),
        dueStatus: dueStatusOf(nextDue, today),
        noticeDue: r.noticeDue as CivilDate | null,
        noticeOverdue: isPast(r.noticeDue as CivilDate | null, today),
        filingDue: r.filingDue as CivilDate | null,
        filingOverdue: isPast(r.filingDue as CivilDate | null, today),
        feesDueCents: r.feesDue,
        unknownPayment: r.unknownPayment,
        reviewers: reviewers.get(r.id) ?? [],
        preservationIncomplete: r.preservationIncomplete,
      }
    }),
    offset,
    prevCursor: offset === 0 ? null : String(Math.max(0, offset - input.limit)),
    nextCursor: rows.length > input.limit ? String(offset + input.limit) : null,
    total: count?.n ?? 0,
  }
}
