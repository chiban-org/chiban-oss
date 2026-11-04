import { and, desc, eq, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { type Role, STAFF_ROLES } from '@/constants/roles'
import type { DbOrTx } from '@/db/client'
import { auditLog, users } from '@/db/schema'
import { roleLabel } from '@/features/staffNav/roleLabels'

export interface HistoryEntry {
  id: string
  at: Date
  byName: string
  text: string
}

const HISTORY_LIMIT = 50

type Describe = (before: unknown, after: unknown) => string

function rolesIn(value: unknown): string {
  const roles = (value as { roles?: unknown } | null)?.roles
  if (!Array.isArray(roles)) return 'no roles'
  const known = STAFF_ROLES.filter((r) => roles.includes(r))
  return known.length === 0 ? 'no roles' : known.map((r: Role) => roleLabel(r)).join(', ')
}

function reasonIn(value: unknown): string {
  const reason = (value as { reason?: unknown } | null)?.reason
  return typeof reason === 'string' ? reason : ''
}

const DESCRIBE: Readonly<Record<string, Describe>> = {
  'user.invite': (_b, a) => `Invited as ${rolesIn(a)}`,
  'user.invite.resend': () => 'Invite sent again',
  'user.invite.revoke': () => 'Invite revoked',
  'user.invite.accept': () => 'Accepted the invite and chose a password',
  'user.roles.change': (b, a) => `Roles changed from ${rolesIn(b)} to ${rolesIn(a)}`,
  'user.disable': (_b, a) => `Disabled. Reason: ${reasonIn(a)}`,
  'user.enable': () => 'Re-enabled',
  'user.totp.reset': () => 'Authenticator reset',
  'user.password_reset.send': () => 'Password reset link sent',
  'user.password.reset': () => 'Set a new password from a reset link',
}

export const HISTORY_ACTIONS = Object.keys(DESCRIBE)

export async function loadUserHistory(db: DbOrTx, userId: string): Promise<HistoryEntry[]> {
  const by = alias(users, 'by_user')
  const rows = await db
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      before: auditLog.before,
      after: auditLog.after,
      byName: by.displayName,
    })
    .from(auditLog)
    .leftJoin(by, eq(by.id, auditLog.actorUserId))
    .where(
      and(
        eq(auditLog.entityType, 'user'),
        eq(auditLog.entityId, userId),
        inArray(auditLog.action, HISTORY_ACTIONS),
      ),
    )
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(HISTORY_LIMIT)
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    byName: r.byName ?? 'System',
    text: DESCRIBE[r.action]?.(r.before, r.after) ?? r.action,
  }))
}

export async function lastDisableReason(db: DbOrTx, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ after: auditLog.after })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, 'user'),
        eq(auditLog.entityId, userId),
        inArray(auditLog.action, ['user.disable', 'user.invite.revoke']),
      ),
    )
    .orderBy(desc(auditLog.at))
    .limit(1)
  return row === undefined ? null : reasonIn(row.after)
}
