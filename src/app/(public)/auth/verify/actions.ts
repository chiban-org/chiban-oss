'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { consumeMagicLink } from '@/features/auth/magicLink'
import { sessionCookieOptions } from '@/features/auth/session'
import { guardAction } from '@/server/actionGuard'

const INVALID = '/sign-in?error=invalid'
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
const ACTION_TIMEOUT_MS = 10_000

export async function confirmMagicLinkAction(formData: FormData): Promise<void> {
  const signal = AbortSignal.timeout(ACTION_TIMEOUT_MS)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) redirect(INVALID)
  const raw = formData.get('token')
  const token = typeof raw === 'string' ? raw : ''
  if (token === '') redirect(INVALID)
  const result = await consumeMagicLink(db, token, signal)
  if (!result.ok) redirect(INVALID)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, result.value.sid, {
    ...sessionCookieOptions(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  redirect('/')
}
