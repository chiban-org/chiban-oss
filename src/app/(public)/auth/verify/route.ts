import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/config/env'
import { SESSION_COOKIE } from '@/constants/cookies'
import { db } from '@/db/client'
import { consumeMagicLink } from '@/features/auth/magicLink'
import { sessionCookieOptions } from '@/features/auth/session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const signal = AbortSignal.timeout(10_000)
  const result = token === '' ? null : await consumeMagicLink(db, token, signal)
  if (result?.ok !== true) {
    return NextResponse.redirect(new URL('/sign-in?error=invalid', env.BASE_URL))
  }
  const response = NextResponse.redirect(new URL('/', env.BASE_URL))
  response.cookies.set(SESSION_COOKIE, result.value.sid, {
    ...sessionCookieOptions(),
    maxAge: 7 * 24 * 60 * 60,
  })
  return response
}
