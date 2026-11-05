'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { changeDisplayName, changeOwnPassword } from '@/features/auth/accountChanges'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/createStaffUser'
import { logoutCore } from '@/features/auth/logout'
import { beginTotpEnrollment, confirmTotpEnrollment } from '@/features/auth/totpEnrollment'
import { guardAction } from '@/server/actionGuard'

const SIGN_IN = '/staff/sign-in'
const SESSION_EXPIRED = 'Your session expired. Reload the page and try again.'

export interface TotpState {
  error: string | null
}

export interface AccountChangeState {
  error: string | null
  message: string | null
}

const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) })

export async function beginTotpAction(_prev: TotpState, formData: FormData): Promise<TotpState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { error: SESSION_EXPIRED }
  if (guard.value === null || guard.value.kind !== 'staff') redirect(SIGN_IN)
  const result = await beginTotpEnrollment(db, guard.value.userId, signal)
  if (!result.ok) return { error: 'Authenticator setup is not available.' }
  redirect('/staff/account/totp')
}

export async function confirmTotpAction(_prev: TotpState, formData: FormData): Promise<TotpState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { error: SESSION_EXPIRED }
  if (guard.value === null || guard.value.kind !== 'staff') redirect(SIGN_IN)
  const parsed = codeSchema.safeParse({ code: formData.get('code') })
  if (!parsed.success) return { error: 'Enter the 6-digit code.' }
  const result = await confirmTotpEnrollment(db, guard.value.userId, parsed.data.code, signal)
  if (!result.ok) return { error: 'That code did not match. Try the next one.' }
  redirect('/staff/account?totp=enabled')
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

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export async function changeNameAction(
  _prev: AccountChangeState,
  formData: FormData,
): Promise<AccountChangeState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { error: SESSION_EXPIRED, message: null }
  if (guard.value === null || guard.value.kind !== 'staff') redirect(SIGN_IN)
  const result = await changeDisplayName(
    db,
    guard.value.userId,
    field(formData, 'displayName'),
    signal,
  )
  if (!result.ok) return { error: 'Enter your name, up to 120 characters.', message: null }
  revalidatePath('/staff', 'layout')
  return { error: null, message: 'Name saved.' }
}

const PASSWORD_ERRORS = {
  wrong_password: 'The current password is not right.',
  weak_password: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  unchanged: 'Choose a password different from the current one.',
  rate_limited: 'Too many wrong attempts. Wait ten minutes and try again.',
} as const

export async function changePasswordAction(
  _prev: AccountChangeState,
  formData: FormData,
): Promise<AccountChangeState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { error: SESSION_EXPIRED, message: null }
  if (guard.value === null || guard.value.kind !== 'staff') redirect(SIGN_IN)
  const next = field(formData, 'password')
  if (next !== field(formData, 'confirm')) {
    return { error: 'The two new passwords do not match.', message: null }
  }
  const jar = await cookies()
  const result = await changeOwnPassword(
    db,
    {
      userId: guard.value.userId,
      current: field(formData, 'current'),
      next,
      keepSid: jar.get(SESSION_COOKIE)?.value ?? null,
    },
    signal,
  )
  if (!result.ok) return { error: PASSWORD_ERRORS[result.error], message: null }
  return { error: null, message: 'Password changed. Other devices were signed out.' }
}
