'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { loadActor } from '@/features/auth/actor'
import { landingFor } from '@/features/auth/landing'
import { consumeMagicLink } from '@/features/auth/magicLink'
import { safeNext } from '@/features/auth/safeNext'
import { sessionCookieOptions } from '@/features/auth/session'
import { guardAction } from '@/server/actionGuard'

const INVALID = '/sign-in?error=invalid'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
const ACTION_TIMEOUT_MS = 10_000

export async function confirmMagicLinkAction(formData: FormData): Promise<void> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok) redirect(INVALID)
  const raw = formData.get('token')
  const token = typeof raw === 'string' ? raw : ''
  if (token === '') redirect(INVALID)
  const result = await consumeMagicLink(db, token, signal)
  if (!result.ok) {
    redirect(guard.value === null ? INVALID : await landingFor(db, guard.value, signal))
  }
  const jar = await cookies()
  jar.set(SESSION_COOKIE, result.value.sid, {
    ...sessionCookieOptions(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  if (result.value.nextPath !== null) redirect(safeNext(result.value.nextPath))
  redirect(await landingFor(db, await loadActor(db, result.value.userId, signal), signal))
}
