import { and, eq, ne, type SQL, sql } from 'drizzle-orm'
import { type Role, STAFF_ROLES } from '@/constants/roles'
import type { Db, DbOrTx, Tx } from '@/db/client'
import { userRoles, users } from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { MailTransport } from '@/features/mail/transport'
import { err, type Result } from '@/types/result'
import { isUuid } from '@/utils/uuid'

export type StaffStatus = 'active' | 'invited' | 'disabled'

export const STAFF_STATUSES: readonly StaffStatus[] = ['active', 'invited', 'disabled']

const inviteExists = (consumedOnly: boolean): SQL =>
  sql`exists (select 1 from staff_account_links l where l.user_id = ${users.id} and l.purpose = 'invite'${consumedOnly ? sql` and l.consumed_at is not null` : sql``})`

export const invitedSql: SQL<boolean> = sql<boolean>`(${users.isActive} and ${inviteExists(false)} and not ${inviteExists(true)})`

export const statusSql: SQL<StaffStatus> = sql<StaffStatus>`case when not ${users.isActive} then 'disabled' when ${invitedSql} then 'invited' else 'active' end`

export interface StaffTarget {
  id: string
  email: string
  displayName: string
  status: StaffStatus
  roles: Role[]
  totpEnabled: boolean
  hasTotpSecret: boolean
}

const STAFF_ROLE_SET: ReadonlySet<string> = new Set(STAFF_ROLES)

export function parseStaffRoles(raw: readonly string[]): Role[] | null {
  const roles = STAFF_ROLES.filter((r) => raw.includes(r))
  if (roles.length === 0 || raw.some((r) => !STAFF_ROLE_SET.has(r))) return null
  return roles
}

export async function loadStaffTarget(db: DbOrTx, userId: string): Promise<StaffTarget | null> {
  if (!isUuid(userId)) return null
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      status: statusSql,
      totpEnabled: users.totpEnabled,
      hasTotpSecret: sql<boolean>`${users.totpSecretEnc} is not null`,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.kind, 'staff')))
  if (row === undefined) return null
  const roles = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
  return { ...row, roles: STAFF_ROLES.filter((r) => roles.some((x) => x.role === r)) }
}

export function isActiveAdmin(target: StaffTarget): boolean {
  return target.status === 'active' && target.roles.includes('admin')
}

export async function otherActiveAdminCount(tx: DbOrTx, userId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(distinct ${users.id})::int` })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'admin')))
    .where(and(eq(users.kind, 'staff'), ne(users.id, userId), sql`${statusSql} = 'active'`))
  return row?.n ?? 0
}

export type ManageError = 'forbidden' | 'not_found'

export async function lockStaffAccounts(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('chiban.staff_accounts'))`)
}

export interface AdminContext {
  db: Db
  actor: Actor
  signal: AbortSignal
  now?: Date
}

export interface MailingAdminContext extends AdminContext {
  mail: MailTransport
}

export async function manageStaff<T, E>(
  { db, actor, signal }: AdminContext,
  userId: string,
  fn: (tx: Tx, target: StaffTarget) => Promise<Result<T, E>>,
): Promise<Result<T, E | ManageError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'user.manage', signal))) return err('forbidden')
  return await transactionResult<T, E | ManageError>(db, async (tx) => {
    await lockStaffAccounts(tx)
    if (!(await hasCapability(tx, actor.userId, 'user.manage', signal))) return err('forbidden')
    const target = await loadStaffTarget(tx, userId)
    if (target === null) return err('not_found')
    return await fn(tx, target)
  })
}

export async function auditStaff(
  tx: Tx,
  { actor, signal }: AdminContext,
  entry: { action: string; userId: string; before?: unknown; after?: unknown },
): Promise<void> {
  await writeAudit(
    tx,
    {
      actor: { kind: 'user', userId: actor.userId },
      action: entry.action,
      entityType: 'user',
      entityId: entry.userId,
      before: entry.before,
      after: entry.after,
    },
    signal,
  )
}
