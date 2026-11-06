import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createObjectStore } from '@/features/storage/objectStore'
import { prepareBucket } from '@/features/storage/prepareBucket'
import { testObjectStoreSettings } from '@/test/objectStore'

function freshBucket() {
  return testObjectStoreSettings(`init-${randomUUID().slice(0, 12)}`)
}

async function preflightOrigin(url: string, origin: string): Promise<string | null> {
  const res = await fetch(url, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'PUT' },
  })
  return res.ok ? res.headers.get('access-control-allow-origin') : null
}

describe('prepareBucket', () => {
  it('running twice leaves one writable bucket', async () => {
    const { config, admin } = freshBucket()
    const signal = AbortSignal.timeout(20_000)
    expect(await prepareBucket(config, admin, ['http://localhost:3000'], signal)).toEqual({
      ok: true,
      value: undefined,
    })
    expect((await prepareBucket(config, admin, ['http://localhost:3000'], signal)).ok).toBe(true)
    const store = createObjectStore(config)
    await store.putBytes('k', new TextEncoder().encode('x'), 'text/plain', signal)
    expect(await store.list('', signal)).toEqual(['k'])
  })

  it('a second run replaces the allowed browser origins', async () => {
    const { config, admin } = freshBucket()
    const signal = AbortSignal.timeout(20_000)
    await prepareBucket(config, admin, ['http://localhost:3000'], signal)
    await prepareBucket(config, admin, ['http://localhost:3100', 'http://localhost:3101'], signal)
    const url = await createObjectStore(config).presignPut('k', {
      contentType: 'text/plain',
      contentLength: 1,
      expiresSeconds: 60,
    })
    expect(await preflightOrigin(url, 'http://localhost:3101')).toBe('http://localhost:3101')
    expect(await preflightOrigin(url, 'http://localhost:3000')).toBeNull()
  })

  it('a wrong admin token is a failure naming the operation', async () => {
    const { config, admin } = freshBucket()
    const result = await prepareBucket(
      config,
      { ...admin, token: 'wrong-token' },
      ['http://localhost:3000'],
      AbortSignal.timeout(20_000),
    )
    expect(result).toMatchObject({ ok: false, error: { operation: 'GetBucketInfo', status: 403 } })
  })

  it('a wrong S3 secret is a failure at the CORS step instead of a thrown error', async () => {
    const { config, admin } = freshBucket()
    const result = await prepareBucket(
      { ...config, secretAccessKey: 'not-the-secret' },
      admin,
      ['http://localhost:3000'],
      AbortSignal.timeout(20_000),
    )
    expect(result).toMatchObject({ ok: false, error: { operation: 'PutBucketCors', status: 403 } })
  })
})
