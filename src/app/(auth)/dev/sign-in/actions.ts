'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { devSignIn, isDevSignInEnabled } from '@/features/auth/devSignIn'
import { sessionCookieOptions } from '@/features/auth/session'
import { guardAction } from '@/server/actionGuard'

const inputSchema = z.object({ email: z.email(), kind: z.enum(['staff', 'public']) })

export async function devSignInAction(formData: FormData): Promise<void> {
  if (!isDevSignInEnabled()) redirect('/dev/sign-in')
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok) redirect('/dev/sign-in')
  const parsed = inputSchema.safeParse({
    email: formData.get('email'),
    kind: formData.get('kind'),
  })
  if (!parsed.success) redirect('/dev/sign-in')
  const result = await devSignIn(db, parsed.data.email, signal)
  if (!result.ok) redirect('/dev/sign-in')
  const jar = await cookies()
  jar.set(SESSION_COOKIE, result.value.sid, {
    ...sessionCookieOptions(),
    maxAge: 7 * 24 * 60 * 60,
  })
  redirect(parsed.data.kind === 'staff' ? '/staff' : '/')
}
