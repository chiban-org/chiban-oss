import { and, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, projects, reviewAssignments } from '@/db/schema'
import { isReviewer } from '@/features/access/roles'
import type { Actor } from '@/features/auth/actor'
import {
  firstParam,
  type RawSearchParams,
  readTableParams,
  type TableParams,
} from '@/features/dataTable/params'
import { parseSort, type SortConfig, type SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'

export const REVIEWS_PATH = '/staff/reviews'

export const REVIEW_TABS = ['open', 'signed_off'] as const
export type ReviewTab = (typeof REVIEW_TABS)[number]

export const REVIEW_TAB_LABELS: ReadonlyMap<ReviewTab, string> = new Map([
  ['open', 'Open'],
  ['signed_off', 'Signed off'],
])

export type ReviewSortKey = 'number' | 'project' | 'status' | 'due'

export const REVIEW_SORT: SortConfig<ReviewSortKey> = {
  defaultKey: 'due',
  columns: { number: 'asc', project: 'asc', status: 'asc', due: 'asc' },
}

export interface ReviewListView {
  params: TableParams
  tab: ReviewTab
  sort: SortState<ReviewSortKey>
}

export function readReviewView(raw: RawSearchParams): ReviewListView {
  const params = readTableParams(raw)
  return {
    params,
    tab: firstParam(params, 'tab') === 'signed_off' ? 'signed_off' : 'open',
    sort: parseSort(REVIEW_SORT, params),
  }
}

export interface ReviewListRow {
  assignmentId: string
  number: string
  projectTitle: string
  status: string
  commentDue: string | null
}

export interface ReviewList {
  rows: ReviewListRow[]
  counts: ReadonlyMap<ReviewTab, number>
}

const OPEN_STATUSES = ['pending', 'commented'] as const

function tabClause(tab: ReviewTab): SQL {
  return tab === 'open'
    ? inArray(reviewAssignments.status, [...OPEN_STATUSES])
    : eq(reviewAssignments.status, 'signed_off')
}

const COMMENT_DUE = sql<string | null>`(select min(t.comment_due) from trc_routings t
  where t.assignment_id = ${reviewAssignments.id})`

const STATUS_ORDER = sql`array_position(array['pending', 'commented', 'signed_off']::text[], ${reviewAssignments.status})`

const SORT_COLUMNS = {
  number: applications.number,
  project: sql`lower(${projects.title})`,
  status: STATUS_ORDER,
  due: COMMENT_DUE,
}

const TIEBREAK = [
  sql`${COMMENT_DUE} asc nulls last`,
  desc(reviewAssignments.assignedAt),
  sql`${reviewAssignments.id} asc`,
]

function mine(actor: Actor): SQL | undefined {
  return and(
    eq(reviewAssignments.reviewerUserId, actor.userId),
    isNull(reviewAssignments.removedAt),
  )
}

export async function listReviewTable(
  db: DbOrTx,
  actor: Actor,
  input: { tab: ReviewTab; sort: SortState<ReviewSortKey> },
  signal: AbortSignal,
): Promise<ReviewList> {
  signal.throwIfAborted()
  if (!isReviewer(actor)) return { rows: [], counts: new Map() }
  const [rows, [tally]] = await Promise.all([
    db
      .select({
        assignmentId: reviewAssignments.id,
        number: applications.number,
        projectTitle: projects.title,
        status: reviewAssignments.status,
        commentDue: COMMENT_DUE,
      })
      .from(reviewAssignments)
      .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
      .innerJoin(projects, eq(projects.id, applications.projectId))
      .where(and(mine(actor), tabClause(input.tab)))
      .orderBy(...orderBySql(input.sort, SORT_COLUMNS, TIEBREAK)),
    db
      .select({
        open: sql<number>`(count(*) filter (where ${tabClause('open')}))::int`,
        signedOff: sql<number>`(count(*) filter (where ${tabClause('signed_off')}))::int`,
      })
      .from(reviewAssignments)
      .where(mine(actor)),
  ])
  return {
    rows,
    counts: new Map([
      ['open', tally?.open ?? 0],
      ['signed_off', tally?.signedOff ?? 0],
    ]),
  }
}
