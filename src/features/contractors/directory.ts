import { and, eq, isNull, type SQL, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  accountProfiles,
  applications,
  type ContractorLicense,
  contractorProfiles,
  projectParties,
  users,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { DIRECTORY_PAGE_SIZE, type DirectorySortKey } from '@/features/contractors/directoryParams'
import { type PageWindow, pageWindow } from '@/features/dataTable/pageSlice'
import type { SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'

export interface DirectoryRow {
  userId: string
  companyName: string
  contactName: string
  email: string
  phone: string | null
  trades: string[]
  licenses: ContractorLicense[]
  projects: number
  lastActivity: Date
}

const linkedParty = and(
  eq(projectParties.userId, users.id),
  eq(projectParties.role, 'contractor'),
  isNull(projectParties.removedAt),
)

const PROJECTS = sql<number>`(select count(distinct ${projectParties.projectId})::int from ${projectParties} where ${linkedParty})`

const LAST_ACTIVITY = sql<Date>`greatest(${contractorProfiles.updatedAt}, (select max(${applications.updatedAt}) from ${applications} join ${projectParties} on ${projectParties.projectId} = ${applications.projectId} where ${linkedParty}))`

const SORT_COLUMNS = {
  company: sql`lower(${contractorProfiles.companyName})`,
  contact: sql`lower(${users.displayName})`,
  projects: PROJECTS,
  activity: LAST_ACTIVITY,
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function searchClause(q: string): SQL | undefined {
  if (q === '') return undefined
  const term = `%${escapeLike(q)}%`
  return sql`(${contractorProfiles.companyName} ilike ${term} or ${users.displayName} ilike ${term} or ${users.email}::text ilike ${term} or ${contractorProfiles.licenses}::text ilike ${term})`
}

export async function listContractorDirectory(
  db: DbOrTx,
  actor: Actor,
  input: { q: string; sort: SortState<DirectorySortKey>; offset: number },
  signal: AbortSignal,
): Promise<(PageWindow & { rows: DirectoryRow[] }) | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'project.manage_parties', signal))) return null
  const where = and(eq(users.kind, 'public'), eq(users.isActive, true), searchClause(input.q))
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contractorProfiles)
    .innerJoin(users, eq(users.id, contractorProfiles.userId))
    .where(where)
  const rows = await db
    .select({
      userId: users.id,
      companyName: contractorProfiles.companyName,
      contactName: users.displayName,
      email: users.email,
      phone: accountProfiles.phone,
      trades: contractorProfiles.trades,
      licenses: contractorProfiles.licenses,
      projects: PROJECTS,
      lastActivity: LAST_ACTIVITY,
    })
    .from(contractorProfiles)
    .innerJoin(users, eq(users.id, contractorProfiles.userId))
    .leftJoin(accountProfiles, eq(accountProfiles.userId, users.id))
    .where(where)
    .orderBy(
      ...orderBySql(input.sort, SORT_COLUMNS, [
        sql`lower(${contractorProfiles.companyName}) asc`,
        sql`${users.id} asc`,
      ]),
    )
    .limit(DIRECTORY_PAGE_SIZE)
    .offset(input.offset)
  return {
    ...pageWindow(input.offset, DIRECTORY_PAGE_SIZE, count?.n ?? 0),
    rows: rows.map((r) => ({ ...r, lastActivity: new Date(r.lastActivity) })),
  }
}
