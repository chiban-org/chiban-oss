'use server'

import { cookies } from 'next/headers'
import { CSRF_COOKIE, CSRF_COOKIE_OPTIONS } from '@/constants/cookies'
import { mintCsrfToken } from '@/features/auth/csrf'

export async function ensureCsrfAction(): Promise<string> {
  const jar = await cookies()
  const existing = jar.get(CSRF_COOKIE)?.value
  if (existing !== undefined) return existing
  const token = mintCsrfToken()
  jar.set(CSRF_COOKIE, token, CSRF_COOKIE_OPTIONS)
  return token
}
