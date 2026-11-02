export const SESSION_COOKIE = 'chiban_sid'
export const CSRF_COOKIE = 'chiban_csrf'

export const CSRF_COOKIE_OPTIONS = {
  httpOnly: false,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60,
} as const
