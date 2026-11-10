'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { clientKey } from '@/features/anonymousIntake/clientKey'
import { devSignIn } from '@/features/auth/devSignIn'
import { revokeSession, sessionCookieOptions } from '@/features/auth/session'
import { isDemoMode } from '@/features/demo/demoMode'
import { takeDemoSignIn } from '@/features/demo/demoSignInLimit'
import { DEMO_PATH, personaFor } from '@/features/demo/personas'
import { guardAction } from '@/server/actionGuard'

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

export async function demoSignInAction(formData: FormData): Promise<void> {
  if (!isDemoMode()) redirect('/')
  const signal = AbortSignal.timeout(15_000)
  const guard = await guardAction(formData, signal, { exempt: 'session' })
  if (!guard.ok) redirect(DEMO_PATH)
  const persona = personaFor(formData.get('email'))
  if (persona === null) redirect(DEMO_PATH)
  if (!takeDemoSignIn(clientKey((await headers()).get('x-forwarded-for')))) {
    redirect(`${DEMO_PATH}?busy=1`)
  }
  const result = await devSignIn(db, persona.email, signal)
  if (!result.ok) redirect(DEMO_PATH)
  const jar = await cookies()
  const previous = jar.get(SESSION_COOKIE)?.value
  if (previous !== undefined && previous !== '') await revokeSession(db, previous, signal)
  jar.set(SESSION_COOKIE, result.value.sid, {
    ...sessionCookieOptions(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
  redirect(persona.home)
}
