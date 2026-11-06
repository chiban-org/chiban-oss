import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isPreconditionFailure } from '@/features/storage/objectStore'
import { makeTestStore, TEST_BROWSER_ORIGIN } from '@/test/objectStore'

const FIVE_BYTES = new TextEncoder().encode('hello')

async function presignFivePdfBytes(): Promise<string> {
  const { store } = await makeTestStore()
  return await store.presignPut(`uploads/${randomUUID()}`, {
    contentType: 'application/pdf',
    contentLength: FIVE_BYTES.length,
    expiresSeconds: 60,
  })
}

async function preflight(url: string, origin: string): Promise<Response> {
  return await fetch(url, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'PUT',
      'access-control-request-headers': 'content-type',
    },
  })
}

describe('object store compatibility', () => {
  it('presigned put with a different content type is rejected with 403', async () => {
    const url = await presignFivePdfBytes()
    const res = await fetch(url, {
      method: 'PUT',
      body: 'hello',
      headers: { 'content-type': 'text/html' },
    })
    expect(res.status).toBe(403)
  })

  it('presigned put from the allowed origin carries the CORS origin on the response', async () => {
    const url = await presignFivePdfBytes()
    const res = await fetch(url, {
      method: 'PUT',
      body: 'hello',
      headers: { 'content-type': 'application/pdf', origin: TEST_BROWSER_ORIGIN },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(TEST_BROWSER_ORIGIN)
  })

  it('preflight from an origin outside the bucket CORS rule is refused', async () => {
    const url = await presignFivePdfBytes()
    const res = await preflight(url, 'https://elsewhere.example')
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://elsewhere.example')
  })

  it('copy with a stale source etag is a precondition failure', async () => {
    const { store } = await makeTestStore()
    const signal = AbortSignal.timeout(10_000)
    await store.putBytes('a', FIVE_BYTES, 'application/pdf', signal)
    const copying = store.copy('a', 'b', signal, { ifMatch: '"0123456789abcdef0123456789abcdef"' })
    const failure = await copying.then(
      () => null,
      (e: unknown) => e,
    )
    expect(isPreconditionFailure(failure)).toBe(true)
    expect((await store.head('b', signal)).ok).toBe(false)
  })
})
