import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ensureBucket } from '@/features/storage/objectStore'
import { makeTestStore } from '@/test/minio'

const FIVE_BYTES = new TextEncoder().encode('hello')

async function put(url: string, body: string, headers: Record<string, string>) {
  return await fetch(url, { method: 'PUT', body, headers })
}

describe('object store', () => {
  it('presigned put with the signed length uploads', async () => {
    const { store } = await makeTestStore()
    const key = `uploads/${randomUUID()}`
    const url = await store.presignPut(key, {
      contentType: 'application/pdf',
      contentLength: FIVE_BYTES.length,
      expiresSeconds: 60,
    })
    const res = await put(url, 'hello', { 'content-type': 'application/pdf' })
    expect(res.status).toBe(200)
    const head = await store.head(key, AbortSignal.timeout(10_000))
    expect(head).toEqual({ ok: true, value: { size: 5 } })
  })

  it('presigned put with a different length is rejected with 403', async () => {
    const { store } = await makeTestStore()
    const url = await store.presignPut(`uploads/${randomUUID()}`, {
      contentType: 'application/pdf',
      contentLength: FIVE_BYTES.length,
      expiresSeconds: 60,
    })
    const res = await put(url, 'hello world', {
      'content-type': 'application/pdf',
    })
    expect(res.status).toBe(403)
  })

  it('preflight from http://localhost:3000 gets Access-Control-Allow-Origin', async () => {
    const { store } = await makeTestStore()
    const url = await store.presignPut(`uploads/${randomUUID()}`, {
      contentType: 'application/pdf',
      contentLength: 5,
      expiresSeconds: 60,
    })
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
  })

  it('presigned get signed ten minutes ago with 60 second expiry is rejected', async () => {
    const { store } = await makeTestStore()
    const key = `blobs/${randomUUID()}`
    await store.putBytes(key, FIVE_BYTES, 'application/pdf', AbortSignal.timeout(10_000))
    const url = await store.presignGet(key, {
      expiresSeconds: 60,
      filename: 'a.pdf',
      contentType: 'application/pdf',
      disposition: 'inline',
      signingDate: new Date(Date.now() - 10 * 60 * 1000),
    })
    expect((await fetch(url)).status).toBe(403)
  })

  it('presigned get serves the bytes with the content disposition', async () => {
    const { store } = await makeTestStore()
    const key = `blobs/${randomUUID()}`
    await store.putBytes(key, FIVE_BYTES, 'application/pdf', AbortSignal.timeout(10_000))
    const url = await store.presignGet(key, {
      expiresSeconds: 60,
      filename: 'plan set.pdf',
      contentType: 'application/pdf',
      disposition: 'inline',
    })
    const res = await fetch(url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('inline')
    expect(await res.text()).toBe('hello')
  })

  it('presigned url host is the public endpoint', async () => {
    const { store, config } = await makeTestStore({ publicEndpoint: 'http://127.0.0.1:1' })
    const url = await store.presignGet('k', {
      expiresSeconds: 60,
      filename: 'a.pdf',
      contentType: 'application/pdf',
      disposition: 'inline',
    })
    expect(new URL(url).host).toBe('127.0.0.1:1')
    expect(config.endpoint).not.toContain('127.0.0.1:1')
  })

  it('head of a missing key is not_found', async () => {
    const { store } = await makeTestStore()
    expect(await store.head('missing', AbortSignal.timeout(10_000))).toEqual({
      ok: false,
      error: 'not_found',
    })
  })

  it('copy and delete move bytes between keys', async () => {
    const { store } = await makeTestStore()
    const signal = AbortSignal.timeout(10_000)
    await store.putBytes('a', FIVE_BYTES, 'application/pdf', signal)
    await store.copy('a', 'b', signal)
    await store.delete('a', signal)
    expect((await store.head('a', signal)).ok).toBe(false)
    expect((await store.head('b', signal)).ok).toBe(true)
  })

  it('ensureBucket twice succeeds', async () => {
    const { store } = await makeTestStore()
    await expect(ensureBucket(store, AbortSignal.timeout(10_000))).resolves.toBeUndefined()
    await expect(ensureBucket(store, AbortSignal.timeout(10_000))).resolves.toBeUndefined()
  })
})
