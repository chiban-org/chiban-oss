import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { staffAccountLinks, users } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import { type HistoryEntry, lastDisableReason, loadUserHistory } from '@/features/users/history'
import {
  isActiveAdmin,
  loadStaffTarget,
  otherActiveAdminCount,
  type StaffTarget,
} from '@/features/users/staffAccounts'

export interface InviteState {
  expired: boolean
  revoked: boolean
  expiresAt: Date
}

export interface UserDetail extends StaffTarget {
  createdAt: Date
  isSelf: boolean
  soleAdmin: boolean
  invite: InviteState | null
  disabledReason: string | null
  history: HistoryEntry[]
}

async function latestInvite(db: Db, userId: string, now: Date): Promise<InviteState | null> {
  const [row] = await db
    .select({ expiresAt: staffAccountLinks.expiresAt, revokedAt: staffAccountLinks.revokedAt })
    .from(staffAccountLinks)
    .where(and(eq(staffAccountLinks.userId, userId), eq(staffAccountLinks.purpose, 'invite')))
    .orderBy(desc(staffAccountLinks.createdAt))
    .limit(1)
  if (row === undefined) return null
  return {
    expiresAt: row.expiresAt,
    expired: row.expiresAt <= now,
    revoked: row.revokedAt !== null,
  }
}

async function soleActiveAdmin(db: Db, target: StaffTarget): Promise<boolean> {
  return isActiveAdmin(target) && (await otherActiveAdminCount(db, target.id)) === 0
}

export async function loadUserDetail(
  db: Db,
  actor: Actor,
  userId: string,
  signal: AbortSignal,
): Promise<UserDetail | null> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'user.manage', signal))) return null
  const target = await loadStaffTarget(db, userId)
  if (target === null) return null
  const now = new Date()
  const [[created], invite, disabledReason, history, soleAdmin] = await Promise.all([
    db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, userId)),
    target.status === 'invited' ? latestInvite(db, userId, now) : Promise.resolve(null),
    target.status === 'disabled' ? lastDisableReason(db, userId) : Promise.resolve(null),
    loadUserHistory(db, userId),
    soleActiveAdmin(db, target),
  ])
  return {
    ...target,
    createdAt: created?.createdAt ?? now,
    isSelf: actor.userId === userId,
    soleAdmin,
    invite,
    disabledReason,
    history,
  }
}
