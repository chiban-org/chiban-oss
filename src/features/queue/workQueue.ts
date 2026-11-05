import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, projects, reviewAssignments, users } from '@/db/schema'
import type { ApplicationTypeBody } from '@/features/applications/applicationTypeSchema'
import type { CoreState } from '@/features/applications/states'
import { substepLabel } from '@/features/applications/statusText'
import type { Actor } from '@/features/auth/actor'
import { getVersion } from '@/features/config/store'
import { defaultSort, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { ruleLabel } from '@/features/packs/ruleLabel'
import { displayIdsFor } from '@/features/parcels/displayId'
import { QUEUE_SORT_COLUMNS, QUEUE_TIEBREAK, queueWhere } from '@/features/queue/queueFilterSql'
import {
  type AssignedFilter,
  type DueFilter,
  type FlagFilter,
  QUEUE_SORT,
  type QueueSortKey,
} from '@/features/queue/queueParams'
import {
  FEES_DUE,
  FILING_DUE,
  NEXT_DUE,
  NEXT_DUE_RULE_KEY,
  NOTICE_DUE,
  preservationIncompleteFor,
  UNKNOWN_PAYMENT,
} from '@/features/queue/queueSql'
import { townToday } from '@/features/town/today'
import { addDays, type CivilDate, daysBetween } from '@/types/civilDate'

const WARNING_DAYS = 5

export interface WorkQueueFilters {
  states?: CoreState[]
  stateKeys?: CoreState[]
  typeKeys?: string[]
  due?: DueFilter[]
  assigned?: AssignedFilter[]
  flags?: FlagFilter[]
  numberContains?: string
}

export type DueStatus = 'overdue' | 'warning' | 'ok' | 'none'

export interface WorkQueueRow {
  applicationId: string
  number: string
  projectTitle: string
  receivedDate: CivilDate | null
  typeLabel: string
  state: CoreState
  substep: string | null
  substepLabel: string | null
  parcelId: string
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

interface TypeLabels {
  label: string
  substeps: { key: string; label: string }[]
}

export async function typeLabels(db: DbOrTx, pins: string[], signal: AbortSignal) {
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
        .where(queueWhere(actor, f, today))
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
  input: {
    filters: WorkQueueFilters
    sort?: SortState<QueueSortKey>
    limit: number
    cursor?: string
  },
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<WorkQueuePage> {
  signal.throwIfAborted()
  const today = await townToday(db, now, signal)
  const where = queueWhere(actor, input.filters, today)
  const sort = input.sort ?? defaultSort(QUEUE_SORT)
  const offset = Math.max(0, Number(input.cursor ?? '0') || 0)
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(applications).where(where)
  const rows = await db
    .select({
      id: applications.id,
      number: applications.number,
      projectTitle: projects.title,
      receivedDate: applications.receivedDate,
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
    .orderBy(...orderBySql(sort, QUEUE_SORT_COLUMNS, QUEUE_TIEBREAK))
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
        projectTitle: r.projectTitle,
        receivedDate: r.receivedDate as CivilDate | null,
        typeLabel: type?.label ?? '',
        state: r.state as CoreState,
        substep: r.substep,
        substepLabel: r.substep === null ? null : substepLabel(r.substep, type?.substeps ?? []),
        parcelId: r.parcelId,
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
