'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { logoutCore } from '@/features/auth/logout'
import { beginTotpEnrollment, confirmTotpEnrollment } from '@/features/auth/totpEnrollment'
import { guardAction } from '@/server/actionGuard'

export interface TotpState {
  error: string | null
}

const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) })

export async function beginTotpAction(_prev: TotpState, formData: FormData): Promise<TotpState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { error: 'Your session expired. Reload the page and try again.' }
  if (guard.value === null || guard.value.kind !== 'staff') redirect('/staff/sign-in')
  const result = await beginTotpEnrollment(db, guard.value.userId, signal)
  if (!result.ok) return { error: 'Authenticator setup is not available.' }
  redirect('/staff/account/totp')
}

export async function confirmTotpAction(_prev: TotpState, formData: FormData): Promise<TotpState> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) return { error: 'Your session expired. Reload the page and try again.' }
  if (guard.value === null || guard.value.kind !== 'staff') redirect('/staff/sign-in')
  const parsed = codeSchema.safeParse({ code: formData.get('code') })
  if (!parsed.success) return { error: 'Enter the 6-digit code.' }
  const result = await confirmTotpEnrollment(db, guard.value.userId, parsed.data.code, signal)
  if (!result.ok) return { error: 'That code did not match. Try the next one.' }
  redirect('/staff/account')
}

export async function signOutAction(formData: FormData): Promise<void> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok) redirect('/staff/sign-in')
  const jar = await cookies()
  await logoutCore({ db, sid: jar.get(SESSION_COOKIE)?.value ?? null, signal })
  jar.delete(SESSION_COOKIE)
  redirect('/staff/sign-in')
}
