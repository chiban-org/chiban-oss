import { eq } from 'drizzle-orm'
import { ErrorIds } from '@/constants/errorIds'
import { userRoles, users } from '@/db/schema'
import type { MailMessage, MailTransport } from '@/features/mail/transport'
import { issueLink, linkUrl, revokeOpenLinks } from '@/features/users/links'
import { inviteMessage } from '@/features/users/mailCopy'
import {
  type AdminContext,
  auditStaff,
  type MailingAdminContext,
  type ManageError,
  manageStaff,
  parseStaffRoles,
} from '@/features/users/staffAccounts'
import { err, ok, type Result } from '@/types/result'

export interface InviteInput {
  displayName: string
  email: string
  roles: readonly string[]
}

type InviteError = 'invalid_input' | 'invalid_roles' | 'email_taken'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function deliver(
  mail: MailTransport,
  message: MailMessage,
  signal: AbortSignal,
): Promise<boolean> {
  const sent = await mail.send(message, signal)
  if (!sent.ok) console.error(`[users] ${ErrorIds.MAIL_SEND_FAILED} staff account email not sent`)
  return sent.ok
}

export async function inviteStaff(
  ctx: MailingAdminContext,
  input: InviteInput,
): Promise<Result<{ userId: string; sent: boolean }, InviteError | 'forbidden'>> {
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  const roles = parseStaffRoles(input.roles)
  const created = await manageStaff<{ userId: string; token: string }, InviteError>(
    ctx,
    ctx.actor.userId,
    async (tx) => {
      if (displayName === '' || !EMAIL_SHAPE.test(email)) return err('invalid_input')
      if (roles === null) return err('invalid_roles')
      const [taken] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1)
      if (taken !== undefined) return err('email_taken')
      const [row] = await tx
        .insert(users)
        .values({ email, displayName, kind: 'staff' })
        .returning({ id: users.id })
      const userId = row?.id ?? ''
      await tx.insert(userRoles).values(roles.map((role) => ({ userId, role })))
      const token = await issueLink(
        tx,
        { userId, purpose: 'invite', createdBy: ctx.actor.userId },
        ctx.now ?? new Date(),
      )
      await auditStaff(tx, ctx, { action: 'user.invite', userId, after: { email, roles } })
      return ok({ userId, token })
    },
  )
  if (!created.ok) return err(created.error === 'not_found' ? 'forbidden' : created.error)
  const sent = await deliver(
    ctx.mail,
    inviteMessage({ email, displayName, roles: roles ?? [] }, linkUrl(created.value.token)),
    ctx.signal,
  )
  return ok({ userId: created.value.userId, sent })
}

export async function resendInvite(
  ctx: MailingAdminContext,
  userId: string,
): Promise<Result<{ sent: boolean }, ManageError | 'not_invited'>> {
  const issued = await manageStaff(ctx, userId, async (tx, target) => {
    if (target.status !== 'invited') return err('not_invited' as const)
    const token = await issueLink(
      tx,
      { userId, purpose: 'invite', createdBy: ctx.actor.userId },
      ctx.now ?? new Date(),
    )
    await auditStaff(tx, ctx, { action: 'user.invite.resend', userId })
    return ok({ target, token })
  })
  if (!issued.ok) return issued
  const { target, token } = issued.value
  return ok({ sent: await deliver(ctx.mail, inviteMessage(target, linkUrl(token)), ctx.signal) })
}

export async function revokeInvite(
  ctx: AdminContext,
  userId: string,
): Promise<Result<void, ManageError | 'not_invited'>> {
  return await manageStaff(ctx, userId, async (tx, target) => {
    if (target.status !== 'invited') return err('not_invited' as const)
    await revokeOpenLinks(tx, userId, null)
    await tx.update(users).set({ isActive: false }).where(eq(users.id, userId))
    await auditStaff(tx, ctx, {
      action: 'user.invite.revoke',
      userId,
      after: { reason: 'Invite revoked' },
    })
    return ok(undefined)
  })
}
