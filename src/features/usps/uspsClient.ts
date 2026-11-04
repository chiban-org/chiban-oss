import type { UspsQuery } from '@/features/usps/addressQuery'
import { readAddressResponse, type StandardAddress } from '@/features/usps/standardAddress'
import {
  createTokenSource,
  type UspsCredentials,
  type UspsDeps,
  type UspsFailure,
} from '@/features/usps/uspsToken'
import { err, ok, type Result } from '@/types/result'

export type LookupOutcome = Result<StandardAddress | null, UspsFailure>

export interface UspsLookup {
  standardize(query: UspsQuery, signal: AbortSignal): Promise<LookupOutcome>
}

function addressUrl(apiBase: string, query: UspsQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') params.set(key, value)
  }
  return `${apiBase}/addresses/v3/address?${params.toString()}`
}

async function readOutcome(response: Response): Promise<LookupOutcome> {
  if (response.status === 404) return ok(null)
  if (!response.ok) return err(response.status === 401 ? 'refused' : 'unreachable')
  const address = readAddressResponse(await response.json().catch(() => null))
  return address === null ? err('bad_shape') : ok(address)
}

export function createUspsClient(credentials: UspsCredentials, deps: UspsDeps): UspsLookup {
  const tokens = createTokenSource(credentials, deps)
  const attempt = async (query: UspsQuery, signal: AbortSignal): Promise<LookupOutcome> => {
    const token = await tokens.get(signal)
    if (!token.ok) return token
    try {
      const response = await deps.fetch(addressUrl(credentials.apiBase, query), {
        headers: { authorization: `Bearer ${token.value}`, accept: 'application/json' },
        signal,
      })
      return await readOutcome(response)
    } catch {
      return err('unreachable')
    }
  }
  return {
    async standardize(query, signal) {
      const first = await attempt(query, signal)
      if (first.ok || first.error !== 'refused') return first
      tokens.forget()
      return await attempt(query, signal)
    },
  }
}
