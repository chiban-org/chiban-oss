import { z } from 'zod'
import { err, ok, type Result } from '@/types/result'

const REFRESH_MARGIN_MS = 60_000
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default'

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
})

export interface GraphTokenError {
  kind: 'unreachable' | 'auth_failed' | 'bad_shape'
  detail: string
}

export interface GraphTokenSource {
  tenantId: string
  clientId: string
  authorityBase: string
}

export interface TokenDeps {
  fetch: typeof fetch
  now: () => Date
}

export interface TokenProvider {
  get(signal: AbortSignal): Promise<Result<string, GraphTokenError>>
}

export function createTokenProvider(
  source: GraphTokenSource,
  secret: string,
  deps: TokenDeps,
): TokenProvider {
  let cached: { token: string; refreshAtMs: number } | null = null
  return {
    async get(signal) {
      signal.throwIfAborted()
      if (cached !== null && deps.now().getTime() < cached.refreshAtMs) return ok(cached.token)
      const url = `${source.authorityBase}/${encodeURIComponent(source.tenantId)}/oauth2/v2.0/token`
      let response: Response
      try {
        response = await deps.fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: source.clientId,
            client_secret: secret,
            scope: GRAPH_SCOPE,
            grant_type: 'client_credentials',
          }),
          signal,
        })
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') throw e
        return err({ kind: 'unreachable', detail: 'token endpoint did not answer' })
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return err({ kind: 'auth_failed', detail: 'Microsoft refused the client credentials' })
      }
      if (!response.ok) {
        return err({ kind: 'unreachable', detail: `token endpoint answered ${response.status}` })
      }
      const parsed = TokenResponseSchema.safeParse(await response.json().catch(() => null))
      if (!parsed.success) return err({ kind: 'bad_shape', detail: 'token response had no token' })
      cached = {
        token: parsed.data.access_token,
        refreshAtMs: deps.now().getTime() + parsed.data.expires_in * 1000 - REFRESH_MARGIN_MS,
      }
      return ok(cached.token)
    },
  }
}
