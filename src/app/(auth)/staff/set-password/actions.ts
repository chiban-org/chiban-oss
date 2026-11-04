'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { MIN_PASSWORD_LENGTH } from '@/features/auth/createStaffUser'
import { sessionCookieOptions } from '@/features/auth/session'
import { deadLinkCopy } from '@/features/users/linkCopy'
import { completeStaffLink } from '@/features/users/links'
import { guardAction } from '@/server/actionGuard'

export interface SetPasswordState {
  error: string | null
}

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
const ACTION_TIMEOUT_MS = 15_000

function field(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export async function setPasswordAction(
  _prev: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok) return { error: 'Your session expired. Reload the page and try again.' }
  const password = field(formData, 'password')
  if (password !== field(formData, 'confirm')) return { error: 'The two passwords do not match.' }
  const result = await completeStaffLink(db, { token: field(formData, 'token'), password }, signal)
  if (!result.ok) {
    return {
      error:
        result.error === 'weak_password'
          ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
          : deadLinkCopy(result.error, null),
    }
  }
  if (result.value.sid === null) redirect('/staff/sign-in?password=reset')
  const jar = await cookies()
  jar.set(SESSION_COOKIE, result.value.sid, {
    ...sessionCookieOptions(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  redirect('/staff')
}
