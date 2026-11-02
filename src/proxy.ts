import { type NextRequest, NextResponse } from 'next/server'
import { ANONYMOUS_PREFIXES } from '@/constants/anonymousRoutes'
import { CSRF_COOKIE, CSRF_COOKIE_OPTIONS } from '@/constants/cookies'
import { mintCsrfToken } from '@/features/auth/csrf'

export const config = {
  matcher: ['/((?!_next/|api/tiles/|report-anonymously|intake/anonymous|.*\\.[a-zA-Z0-9]+$).*)'],
}

const SKIPPED_PREFIXES = [
  '/_next/',
  '/api/tiles/',
  '/api/payments/webhooks/',
  ...ANONYMOUS_PREFIXES,
]

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl
  const skipped = SKIPPED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  if (skipped || request.method !== 'GET' || request.cookies.has(CSRF_COOKIE)) {
    return NextResponse.next()
  }
  const token = mintCsrfToken()
  const headers = new Headers(request.headers)
  const existing = headers.get('cookie')
  const minted = `${CSRF_COOKIE}=${token}`
  headers.set('cookie', existing === null || existing === '' ? minted : `${existing}; ${minted}`)
  const response = NextResponse.next({ request: { headers } })
  response.cookies.set(CSRF_COOKIE, token, CSRF_COOKIE_OPTIONS)
  return response
}
