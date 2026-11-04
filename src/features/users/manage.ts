import { and, eq, notInArray } from 'drizzle-orm'
import { userRoles, users } from '@/db/schema'
import { revokeAllSessions } from '@/features/auth/session'
import { revokeOpenLinks } from '@/features/users/links'
import {
  type AdminContext,
  auditStaff,
  isActiveAdmin,
  type ManageError,
  manageStaff,
  otherActiveAdminCount,
  parseStaffRoles,
} from '@/features/users/staffAccounts'
import { err, ok, type Result } from '@/types/result'

export const MAX_REASON_LENGTH = 500

export async function setStaffRoles(
  ctx: AdminContext,
  userId: string,
  rawRoles: readonly string[],
): Promise<Result<void, ManageError | 'invalid_roles' | 'last_admin'>> {
  const roles = parseStaffRoles(rawRoles)
  return await manageStaff(ctx, userId, async (tx, target) => {
    if (roles === null) return err('invalid_roles' as const)
    const losesAdmin = isActiveAdmin(target) && !roles.includes('admin')
    if (losesAdmin && (await otherActiveAdminCount(tx, userId)) === 0) {
      return err('last_admin' as const)
    }
    await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), notInArray(userRoles.role, roles)))
    await tx
      .insert(userRoles)
      .values(roles.map((role) => ({ userId, role })))
      .onConflictDoNothing()
    await auditStaff(tx, ctx, {
      action: 'user.roles.change',
      userId,
      before: { roles: target.roles },
      after: { roles },
    })
    return ok(undefined)
  })
}

type DisableError = 'reason_required' | 'self' | 'last_admin' | 'already_disabled'

export async function disableStaff(
  ctx: AdminContext,
  userId: string,
  rawReason: string,
): Promise<Result<void, ManageError | DisableError>> {
  const reason = rawReason.trim().slice(0, MAX_REASON_LENGTH)
  return await manageStaff<void, DisableError>(ctx, userId, async (tx, target) => {
    if (reason === '') return err('reason_required')
    if (userId === ctx.actor.userId) return err('self')
    if (target.status === 'disabled') return err('already_disabled')
    if (isActiveAdmin(target) && (await otherActiveAdminCount(tx, userId)) === 0) {
      return err('last_admin')
    }
    await tx.update(users).set({ isActive: false }).where(eq(users.id, userId))
    await revokeAllSessions(tx, userId, ctx.signal)
    await revokeOpenLinks(tx, userId, null)
    await auditStaff(tx, ctx, { action: 'user.disable', userId, after: { reason } })
    return ok(undefined)
  })
}

export async function enableStaff(
  ctx: AdminContext,
  userId: string,
): Promise<Result<void, ManageError | 'not_disabled'>> {
  return await manageStaff(ctx, userId, async (tx, target) => {
    if (target.status !== 'disabled') return err('not_disabled' as const)
    await tx.update(users).set({ isActive: true }).where(eq(users.id, userId))
    await auditStaff(tx, ctx, { action: 'user.enable', userId })
    return ok(undefined)
  })
}
