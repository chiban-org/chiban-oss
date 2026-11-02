'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { logoutCore } from '@/features/auth/logout'
import { guardAction } from '@/server/actionGuard'

export async function signOutPublicAction(formData: FormData): Promise<void> {
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal)
  if (!guard.ok) redirect('/sign-in')
  const jar = await cookies()
  await logoutCore({ db, sid: jar.get(SESSION_COOKIE)?.value ?? null, signal })
  jar.delete(SESSION_COOKIE)
  redirect('/')
}
