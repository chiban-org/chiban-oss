'use server'

import { redirect } from 'next/navigation'
import { getMailTransport } from '@/features/mail/transport'
import { resetAuthenticator, sendPasswordReset } from '@/features/users/credentials'
import { unsentCopy, userErrorCopy } from '@/features/users/errorCopy'
import { inviteStaff, resendInvite, revokeInvite } from '@/features/users/invite'
import { disableStaff, enableStaff, setStaffRoles } from '@/features/users/manage'
import { USERS_PATH } from '@/features/users/userListParams'
import { type ActionContext, type ActionResult, runStaffAction, text } from '@/server/actionRunner'
import type { Result } from '@/types/result'

function done(result: Result<unknown, string>, message: string): ActionResult {
  return result.ok ? { ok: true, message } : { ok: false, error: userErrorCopy(result.error) }
}

function mailed(result: Result<{ sent: boolean }, string>, message: string): ActionResult {
  if (!result.ok) return { ok: false, error: userErrorCopy(result.error) }
  return result.value.sent ? { ok: true, message } : { ok: false, error: unsentCopy(message) }
}

function withMail(ctx: ActionContext) {
  return { ...ctx, mail: getMailTransport() }
}

function roles(formData: FormData): string[] {
  return formData.getAll('roles').filter((r): r is string => typeof r === 'string')
}

export async function inviteStaffAction(formData: FormData): Promise<ActionResult> {
  const outcome: { created?: { userId: string; sent: boolean } } = {}
  const result = await runStaffAction(formData, async (ctx) => {
    const invited = await inviteStaff(withMail(ctx), {
      displayName: text(formData, 'displayName'),
      email: text(formData, 'email'),
      roles: roles(formData),
    })
    if (!invited.ok) return { ok: false, error: userErrorCopy(invited.error) }
    outcome.created = invited.value
    return { ok: true, message: 'Invite sent.' }
  })
  const made = outcome.created
  if (result.ok && made !== undefined) {
    redirect(`${USERS_PATH}/${made.userId}?notice=${made.sent ? 'invited' : 'unsent'}`)
  }
  return result
}

export async function resendInviteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) =>
    mailed(
      await resendInvite(withMail(ctx), text(formData, 'userId')),
      'A new invite link was sent. The old link no longer works.',
    ),
  )
}

export async function revokeInviteAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) =>
    done(
      await revokeInvite(ctx, text(formData, 'userId')),
      'Invite revoked. The account is disabled.',
    ),
  )
}

export async function setRolesAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) =>
    done(
      await setStaffRoles(ctx, text(formData, 'userId'), roles(formData)),
      'Roles saved. They apply on the next page this person opens.',
    ),
  )
}

export async function disableAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) =>
    done(
      await disableStaff(ctx, text(formData, 'userId'), text(formData, 'reason')),
      'Account disabled. This person is signed out everywhere.',
    ),
  )
}

export async function enableAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) =>
    done(
      await enableStaff(ctx, text(formData, 'userId')),
      'Account re-enabled. This person can sign in again.',
    ),
  )
}

export async function resetAuthenticatorAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) =>
    done(
      await resetAuthenticator(ctx, text(formData, 'userId')),
      'Authenticator cleared. They can set up a new one from Account.',
    ),
  )
}

export async function sendResetAction(formData: FormData): Promise<ActionResult> {
  return await runStaffAction(formData, async (ctx) =>
    mailed(
      await sendPasswordReset(withMail(ctx), text(formData, 'userId')),
      'Password reset link sent. It works once and expires in 24 hours.',
    ),
  )
}
