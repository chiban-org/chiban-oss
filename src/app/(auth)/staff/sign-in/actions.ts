'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { sessionCookieOptions } from '@/features/auth/session'
import { staffSignIn } from '@/features/auth/staffSignIn'
import { guardAction } from '@/server/actionGuard'

export interface SignInState {
  error: string | null
  needTotp: boolean
}

const inputSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  totp: z.string().optional(),
})

const GENERIC = 'Email, password, or code is incorrect.'

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal)
  if (!guard.ok)
    return { error: 'Your session expired. Reload the page and try again.', needTotp: false }

  const parsed = inputSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    totp: formData.get('totp') ?? undefined,
  })
  if (!parsed.success) return { error: GENERIC, needTotp: false }

  const result = await staffSignIn(db, parsed.data, signal)
  if (!result.ok) {
    if (result.error === 'totp_required') return { error: null, needTotp: true }
    if (result.error === 'rate_limited') {
      return { error: 'Too many attempts. Try again in a few minutes.', needTotp: false }
    }
    return { error: GENERIC, needTotp: parsed.data.totp !== undefined && parsed.data.totp !== '' }
  }

  const jar = await cookies()
  jar.set(SESSION_COOKIE, result.value.sid, {
    ...sessionCookieOptions(),
    maxAge: 7 * 24 * 60 * 60,
  })
  redirect('/staff/account')
}
