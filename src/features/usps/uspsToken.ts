import { z } from 'zod'
import { err, ok, type Result } from '@/types/result'

const REFRESH_MARGIN_MS = 60_000

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
})

export interface UspsCredentials {
  clientId: string
  clientSecret: string
  apiBase: string
}

export interface UspsDeps {
  fetch: typeof fetch
  now: () => number
}

export type UspsFailure = 'unreachable' | 'refused' | 'credentials_refused' | 'bad_shape'

export interface UspsTokenSource {
  get(signal: AbortSignal): Promise<Result<string, UspsFailure>>
  forget(): void
}

async function requestToken(
  credentials: UspsCredentials,
  deps: UspsDeps,
  signal: AbortSignal,
): Promise<Result<{ token: string; expiresInMs: number }, UspsFailure>> {
  let response: Response
  try {
    response = await deps.fetch(`${credentials.apiBase}/oauth2/v3/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }).toString(),
      signal,
    })
  } catch {
    return err('unreachable')
  }
  if (!response.ok) return err(response.status === 401 ? 'credentials_refused' : 'unreachable')
  const parsed = TokenResponseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) return err('bad_shape')
  return ok({ token: parsed.data.access_token, expiresInMs: parsed.data.expires_in * 1000 })
}

export function createTokenSource(credentials: UspsCredentials, deps: UspsDeps): UspsTokenSource {
  let cached: { token: string; refreshAtMs: number } | null = null
  let pending: Promise<Result<string, UspsFailure>> | null = null
  const refresh = async (signal: AbortSignal): Promise<Result<string, UspsFailure>> => {
    const issued = await requestToken(credentials, deps, signal)
    if (!issued.ok) return issued
    cached = {
      token: issued.value.token,
      refreshAtMs: deps.now() + issued.value.expiresInMs - REFRESH_MARGIN_MS,
    }
    return ok(cached.token)
  }
  return {
    get(signal) {
      if (cached !== null && deps.now() < cached.refreshAtMs)
        return Promise.resolve(ok(cached.token))
      pending ??= refresh(signal).finally(() => {
        pending = null
      })
      return pending
    },
    forget() {
      cached = null
    },
  }
}
