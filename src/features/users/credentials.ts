import { eq } from 'drizzle-orm'
import { users } from '@/db/schema'
import { deliver } from '@/features/users/invite'
import { issueLink, linkUrl } from '@/features/users/links'
import { resetMessage } from '@/features/users/mailCopy'
import {
  type AdminContext,
  auditStaff,
  type MailingAdminContext,
  type ManageError,
  manageStaff,
} from '@/features/users/staffAccounts'
import { err, ok, type Result } from '@/types/result'

export async function resetAuthenticator(
  ctx: AdminContext,
  userId: string,
): Promise<Result<void, ManageError | 'no_authenticator'>> {
  return await manageStaff(ctx, userId, async (tx, target) => {
    if (!target.totpEnabled && !target.hasTotpSecret) return err('no_authenticator' as const)
    await tx
      .update(users)
      .set({ totpEnabled: false, totpSecretEnc: null, totpLastCounter: null })
      .where(eq(users.id, userId))
    await auditStaff(tx, ctx, { action: 'user.totp.reset', userId })
    return ok(undefined)
  })
}

export async function sendPasswordReset(
  ctx: MailingAdminContext,
  userId: string,
): Promise<Result<{ sent: boolean }, ManageError | 'not_active'>> {
  const issued = await manageStaff(ctx, userId, async (tx, target) => {
    if (target.status !== 'active') return err('not_active' as const)
    const token = await issueLink(
      tx,
      { userId, purpose: 'password_reset', createdBy: ctx.actor.userId },
      ctx.now ?? new Date(),
    )
    await auditStaff(tx, ctx, { action: 'user.password_reset.send', userId })
    return ok({ target, token })
  })
  if (!issued.ok) return issued
  const { target, token } = issued.value
  return ok({ sent: await deliver(ctx.mail, resetMessage(target, linkUrl(token)), ctx.signal) })
}
