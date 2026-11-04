import { describe, expect, it } from 'vitest'
import { createUspsClient } from '@/features/usps/uspsClient'

const CREDENTIALS = {
  clientId: 'consumer-key',
  clientSecret: 'consumer-secret',
  apiBase: 'https://apis-tem.usps.com',
}
const QUERY = { streetAddress: '1 Main Street', city: 'Alder Pond', state: 'NH' }
const ADDRESS = {
  address: {
    streetAddress: '1 MAIN ST',
    city: 'ALDER POND',
    state: 'NH',
    ZIPCode: '03000',
    ZIPPlus4: '1234',
  },
}

interface Call {
  url: string
  init: RequestInit | undefined
}

function fakeUsps(addressStatuses: number[] = [200]) {
  const calls: Call[] = []
  let tokens = 0
  let lookups = 0
  const fetchFn: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString()
    calls.push({ url, init })
    if (url.endsWith('/oauth2/v3/token')) {
      tokens += 1
      return Promise.resolve(
        Response.json({ access_token: `token-${String(tokens)}`, expires_in: 3600 }),
      )
    }
    const status = addressStatuses[Math.min(lookups, addressStatuses.length - 1)] ?? 200
    lookups += 1
    return Promise.resolve(Response.json(status === 200 ? ADDRESS : { error: {} }, { status }))
  }
  return { calls, fetch: fetchFn, tokenCount: () => tokens }
}

function clientWith(fake: ReturnType<typeof fakeUsps>, clock = { now: 0 }) {
  return createUspsClient(CREDENTIALS, { fetch: fake.fetch, now: () => clock.now })
}

const signal = () => new AbortController().signal

describe('USPS client', () => {
  it('asks for a token with the client credentials grant before the address lookup', async () => {
    const fake = fakeUsps()
    const result = await clientWith(fake).standardize(QUERY, signal())
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ ZIPPlus4: '1234' }) })
    const [token, lookup] = fake.calls
    expect(token?.url).toBe('https://apis-tem.usps.com/oauth2/v3/token')
    expect(token?.init?.method).toBe('POST')
    const body = new URLSearchParams(token?.init?.body as string)
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'consumer-key',
      client_secret: 'consumer-secret',
    })
    const url = new URL(lookup?.url ?? '')
    expect(`${url.origin}${url.pathname}`).toBe('https://apis-tem.usps.com/addresses/v3/address')
    expect(Object.fromEntries(url.searchParams)).toEqual(QUERY)
    expect(new Headers(lookup?.init?.headers).get('authorization')).toBe('Bearer token-1')
  })

  it('keeps the token until it is about to expire, then fetches a new one', async () => {
    const fake = fakeUsps()
    const clock = { now: 0 }
    const client = clientWith(fake, clock)
    await client.standardize(QUERY, signal())
    clock.now = 3_000_000
    await client.standardize(QUERY, signal())
    expect(fake.tokenCount()).toBe(1)
    clock.now = 3_550_000
    await client.standardize(QUERY, signal())
    expect(fake.tokenCount()).toBe(2)
  })

  it('shares one token request between lookups that start together', async () => {
    const fake = fakeUsps()
    const client = clientWith(fake)
    await Promise.all([client.standardize(QUERY, signal()), client.standardize(QUERY, signal())])
    expect(fake.tokenCount()).toBe(1)
  })

  it('refreshes the token once when USPS refuses it', async () => {
    const fake = fakeUsps([401, 200])
    const result = await clientWith(fake).standardize(QUERY, signal())
    expect(result.ok).toBe(true)
    expect(fake.tokenCount()).toBe(2)
    const last = fake.calls.at(-1)
    expect(new Headers(last?.init?.headers).get('authorization')).toBe('Bearer token-2')
  })

  it('reads a 404 as no match', async () => {
    expect(await clientWith(fakeUsps([404])).standardize(QUERY, signal())).toEqual({
      ok: true,
      value: null,
    })
  })

  it('reports other answers as failures', async () => {
    for (const status of [400, 429, 503]) {
      const result = await clientWith(fakeUsps([status])).standardize(QUERY, signal())
      expect(result.ok, String(status)).toBe(false)
    }
  })

  it('asks for a token only once when USPS refuses the credentials', async () => {
    let tokenRequests = 0
    const refusing: typeof fetch = () => {
      tokenRequests += 1
      return Promise.resolve(Response.json({ error: 'invalid_client' }, { status: 401 }))
    }
    const client = createUspsClient(CREDENTIALS, { fetch: refusing, now: () => 0 })
    expect((await client.standardize(QUERY, signal())).ok).toBe(false)
    expect(tokenRequests).toBe(1)
  })

  it('reports a token endpoint that cannot be reached as a failure', async () => {
    const down = (() => Promise.reject(new TypeError('fetch failed'))) as typeof fetch
    const client = createUspsClient(CREDENTIALS, { fetch: down, now: () => 0 })
    expect((await client.standardize(QUERY, signal())).ok).toBe(false)
  })
})
