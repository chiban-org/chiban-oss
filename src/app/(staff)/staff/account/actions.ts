'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { changeDisplayName, changeOwnPassword } from '@/features/auth/accountChanges'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/createStaffUser'
import { logoutCore } from '@/features/auth/logout'
import { beginTotpEnrollment, confirmTotpEnrollment } from '@/features/auth/totpEnrollment'
import { guardAction } from '@/server/actionGuard'
import type { ActionResult } from '@/server/actionRunner'
import { refuseField, runStaffForm } from '@/server/formInput'
import { CHANGE_NAME_FORM, CHANGE_PASSWORD_FORM, CONFIRM_TOTP_FORM, NO_FIELDS } from './forms'

const SIGN_IN = '/staff/sign-in'

export async function beginTotpAction(formData: FormData): Promise<ActionResult> {
  const outcome = { started: false }
  const result = await runStaffForm(
    formData,
    NO_FIELDS,
    async ({ db, actor, signal }) => {
      const started = await beginTotpEnrollment(db, actor.userId, signal)
      if (!started.ok) return { ok: false, error: 'Authenticator setup is not available.' }
      outcome.started = true
      return { ok: true, message: 'Authenticator setup started.' }
    },
    { lockedInDemo: true },
  )
  if (outcome.started) redirect('/staff/account/totp')
  return result
}

export async function confirmTotpAction(formData: FormData): Promise<ActionResult> {
  const outcome = { confirmed: false }
  const result = await runStaffForm(
    formData,
    CONFIRM_TOTP_FORM,
    async ({ db, actor, signal }, { code }) => {
      const confirmed = await confirmTotpEnrollment(db, actor.userId, code, signal)
      if (!confirmed.ok) return refuseField('code', 'That code did not match. Try the next one.')
      outcome.confirmed = true
      return { ok: true, message: 'Authenticator turned on.' }
    },
    { lockedInDemo: true },
  )
  if (outcome.confirmed) redirect('/staff/account?totp=enabled')
  return result
}

export async function signOutAction(formData: FormData): Promise<void> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok) redirect(SIGN_IN)
  const jar = await cookies()
  await logoutCore({ db, sid: jar.get(SESSION_COOKIE)?.value ?? null, signal })
  jar.delete(SESSION_COOKIE)
  redirect(SIGN_IN)
}

export async function changeNameAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    CHANGE_NAME_FORM,
    async ({ db, actor, signal }, { displayName }) => {
      const changed = await changeDisplayName(db, actor.userId, displayName, signal)
      if (!changed.ok) return refuseField('displayName', 'Enter your name.')
      return { ok: true, message: 'Name saved.' }
    },
    { lockedInDemo: true },
  )
}

const PASSWORD_REFUSALS = {
  wrong_password: refuseField('current', 'The current password is not right.'),
  weak_password: refuseField('password', `Use at least ${MIN_PASSWORD_LENGTH} characters.`),
  unchanged: refuseField('password', 'Choose a password different from the current one.'),
  rate_limited: {
    ok: false,
    error: 'Too many wrong attempts. Wait ten minutes and try again.',
  },
} as const satisfies Record<string, ActionResult>

export async function changePasswordAction(formData: FormData): Promise<ActionResult> {
  return await runStaffForm(
    formData,
    CHANGE_PASSWORD_FORM,
    async ({ db, actor, signal }, input) => {
      const jar = await cookies()
      const result = await changeOwnPassword(
        db,
        {
          userId: actor.userId,
          current: input.current,
          next: input.password,
          keepSid: jar.get(SESSION_COOKIE)?.value ?? null,
        },
        signal,
      )
      if (!result.ok) return PASSWORD_REFUSALS[result.error]
      return { ok: true, message: 'Password changed. Other devices were signed out.' }
    },
    { lockedInDemo: true },
  )
}
