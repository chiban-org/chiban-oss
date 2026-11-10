'use server'

import { redirect } from 'next/navigation'
import { getMailTransport } from '@/features/mail/transport'
import { resetAuthenticator, sendPasswordReset } from '@/features/users/credentials'
import { unsentCopy, userErrorCopy } from '@/features/users/errorCopy'
import { inviteStaff, resendInvite, revokeInvite } from '@/features/users/invite'
import { disableStaff, enableStaff, setStaffRoles } from '@/features/users/manage'
import { USERS_PATH } from '@/features/users/userListParams'
import type { ActionContext, ActionResult, RunOptions } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import type { Result } from '@/types/result'
import { DISABLE_FORM, INVITE_FORM, SET_ROLES_FORM, USER_FORM } from './forms'

const FIELD_OF_ERROR: Readonly<Record<string, string>> = {
  email_taken: 'email',
  invalid_roles: 'roles',
  reason_required: 'reason',
}

function failure(error: string): ActionResult {
  const field = FIELD_OF_ERROR[error]
  return field === undefined
    ? { ok: false, error: userErrorCopy(error) }
    : refuseField(field, userErrorCopy(error))
}

function done(result: Result<unknown, string>, message: string): ActionResult {
  return result.ok ? { ok: true, message } : failure(result.error)
}

function mailed(result: Result<{ sent: boolean }, string>, message: string): ActionResult {
  if (!result.ok) return failure(result.error)
  return result.value.sent ? { ok: true, message } : { ok: false, error: unsentCopy(message) }
}

const LOCKED: RunOptions = { lockedInDemo: true }

function withMail(ctx: ActionContext) {
  return { ...ctx, mail: getMailTransport() }
}

export async function inviteStaffAction(formData: FormData): Promise<ActionResult> {
  const outcome: { created?: { userId: string; sent: boolean } } = {}
  const result = await runStaffForm(
    formData,
    INVITE_FORM,
    async (ctx, input) => {
      const invited = await inviteStaff(withMail(ctx), input)
      if (!invited.ok) return failure(invited.error)
      outcome.created = invited.value
      return { ok: true, message: 'Invite sent.' }
    },
    LOCKED,
  )
  const made = outcome.created
  if (result.ok && made !== undefined) {
    redirect(`${USERS_PATH}/${made.userId}?notice=${made.sent ? 'invited' : 'unsent'}`)
  }
  return result
}

export async function resendInviteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    USER_FORM,
    async (ctx, { userId }) =>
      mailed(
        await resendInvite(withMail(ctx), userId),
        'A new invite link was sent. The old link no longer works.',
      ),
    LOCKED,
  )
}

export async function revokeInviteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    USER_FORM,
    async (ctx, { userId }) =>
      done(await revokeInvite(ctx, userId), 'Invite revoked. The account is disabled.'),
    LOCKED,
  )
}

export async function setRolesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    SET_ROLES_FORM,
    async (ctx, { userId, roles }) =>
      done(
        await setStaffRoles(ctx, userId, roles),
        'Roles saved. They apply on the next page this person opens.',
      ),
    LOCKED,
  )
}

export async function disableAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    DISABLE_FORM,
    async (ctx, { userId, reason }) =>
      done(
        await disableStaff(ctx, userId, reason),
        'Account disabled. This person is signed out everywhere.',
      ),
    LOCKED,
  )
}

export async function enableAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    USER_FORM,
    async (ctx, { userId }) =>
      done(await enableStaff(ctx, userId), 'Account re-enabled. This person can sign in again.'),
    LOCKED,
  )
}

export async function resetAuthenticatorAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    USER_FORM,
    async (ctx, { userId }) =>
      done(
        await resetAuthenticator(ctx, userId),
        'Authenticator cleared. They can set up a new one from Account.',
      ),
    LOCKED,
  )
}

export async function sendResetAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    USER_FORM,
    async (ctx, { userId }) =>
      mailed(
        await sendPasswordReset(withMail(ctx), userId),
        'Password reset link sent. It works once and expires in 24 hours.',
      ),
    LOCKED,
  )
}
