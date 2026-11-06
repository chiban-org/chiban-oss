import { cookies, headers } from 'next/headers'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import { db } from '@/db/client'
import type { Actor } from '@/features/auth/actor'
import { CSRF_COOKIE, validateCsrf } from '@/features/auth/csrf'
import { currentServiceState } from '@/features/town/serviceStatus'
import { getActor } from '@/server/getActor'
import { err, ok, type Result } from '@/types/result'

export const CSRF_FIELD = 'csrf_token'

type GuardInput = FormData | { csrfToken?: string | null }

function extractToken(input: GuardInput): string | null {
  if (input instanceof FormData) {
    const value = input.get(CSRF_FIELD)
    return typeof value === 'string' ? value : null
  }
  return input.csrfToken ?? null
}

export interface GuardOptions {
  exempt?: 'session' | 'export'
  answersCheck?: boolean
}

export function isCheckOnly(input: GuardInput): boolean {
  return input instanceof FormData && input.has(CHECK_ONLY_FIELD)
}

export async function guardAction(
  input: GuardInput,
  signal: AbortSignal,
  options: GuardOptions = {},
): Promise<Result<Actor | null, 'csrf' | 'service_inactive' | 'check_unsupported'>> {
  const [h, jar] = await Promise.all([headers(), cookies()])
  const verdict = validateCsrf({
    cookieToken: jar.get(CSRF_COOKIE)?.value ?? null,
    headerToken: extractToken(input),
    origin: h.get('origin'),
    host: h.get('host'),
    secFetchSite: h.get('sec-fetch-site'),
  })
  if (!verdict.ok) return err('csrf')
  const state = await currentServiceState(db, new Date(), signal)
  if (state.mode === 'closed' && options.exempt !== 'session') return err('service_inactive')
  if (state.mode === 'export_only' && options.exempt === undefined) return err('service_inactive')
  if (isCheckOnly(input) && options.answersCheck !== true) return err('check_unsupported')
  return ok(await getActor(signal))
}
