'use server'

import { cookies } from 'next/headers'
import { CSRF_COOKIE } from '@/constants/cookies'
import { mintCsrfToken } from '@/features/auth/csrf'

export async function ensureCsrfAction(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(CSRF_COOKIE)?.value
  if (existing !== undefined) return existing
  const token = mintCsrfToken()
  jar.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return token
}
