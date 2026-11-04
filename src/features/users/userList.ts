import { asc, eq, sql } from 'drizzle-orm'
import { type Role, STAFF_ROLES } from '@/constants/roles'
import type { Db } from '@/db/client'
import { userRoles, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { SortState } from '@/features/dataTable/sort'
import { orderBySql } from '@/features/dataTable/sortSql'
import { roleLabel } from '@/features/staffNav/roleLabels'
import { type StaffStatus, statusSql } from '@/features/users/staffAccounts'
import type { UserSortKey } from '@/features/users/userListParams'

export interface UserRow {
  id: string
  name: string
  email: string
  roleLabels: string[]
  status: StaffStatus
  authenticator: boolean
}

export interface UserListResult {
  rows: UserRow[]
  counts: ReadonlyMap<StaffStatus, number>
}

const ROLE_RANK = sql`min(array_position(array[${sql.raw(STAFF_ROLES.map((r) => `'${r}'`).join(','))}]::text[], ${userRoles.role}))`

const SORT_COLUMNS = {
  name: sql`lower(${users.displayName})`,
  email: sql`lower(${users.email})`,
  roles: ROLE_RANK,
  authenticator: users.totpEnabled,
}

function labelsOf(roles: readonly string[]): string[] {
  return STAFF_ROLES.filter((r) => roles.includes(r)).map((r: Role) => roleLabel(r))
}

export async function loadUserList(
  db: Db,
  actor: Actor,
  input: { tab: StaffStatus; sort: SortState<UserSortKey> },
  signal: AbortSignal,
): Promise<UserListResult | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'user.manage', signal))) return null
  const [rows, tally] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.displayName,
        email: users.email,
        authenticator: users.totpEnabled,
        roles: sql<
          string[]
        >`coalesce(array_agg(${userRoles.role}) filter (where ${userRoles.role} is not null), '{}')`,
      })
      .from(users)
      .leftJoin(userRoles, eq(userRoles.userId, users.id))
      .where(sql`${users.kind} = 'staff' and ${statusSql} = ${input.tab}`)
      .groupBy(users.id)
      .orderBy(
        ...orderBySql(input.sort, SORT_COLUMNS, [sql`lower(${users.displayName})`, asc(users.id)]),
      ),
    db
      .select({ status: statusSql, n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.kind, 'staff'))
      .groupBy(statusSql),
  ])
  return {
    rows: rows.map((r) => ({ ...r, roleLabels: labelsOf(r.roles), status: input.tab })),
    counts: new Map(tally.map((t) => [t.status, t.n])),
  }
}
