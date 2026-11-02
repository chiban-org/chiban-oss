import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readAll } from '@/features/export/readArchive'
import { createOneDriveTarget, ONEDRIVE_TARGET_STATUS } from '@/features/export/targets/oneDrive'
import { FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FAKE_TENANT_ID } from '@/test/fakes/graphFakeServer'
import {
  FAKE_DRIVE_ID,
  type OneDriveFakeServer,
  startOneDriveFakeServer,
} from '@/test/fakes/oneDriveFakeServer'

const signal = new AbortController().signal
const CHUNK = 3_276_800
let fake: OneDriveFakeServer

function target(secret = FAKE_CLIENT_SECRET) {
  return createOneDriveTarget(
    {
      tenantId: FAKE_TENANT_ID,
      clientId: FAKE_CLIENT_ID,
      driveId: FAKE_DRIVE_ID,
      authorityBase: fake.authorityBase,
      graphBase: fake.graphBase,
    },
    secret,
    { fetch, now: () => new Date() },
  )
}

async function putBytes(t: ReturnType<typeof target>, path: string, bytes: Buffer) {
  return await t.put(path, Readable.from([bytes]), bytes.length, signal)
}

beforeAll(async () => {
  fake = await startOneDriveFakeServer()
})
afterAll(async () => {
  await fake.stop()
})

describe('onedrive target against the fake tenant', () => {
  it('connect obtains a token with client credentials', async () => {
    const r = await putBytes(target(), 'chiban-export/connect.txt', Buffer.from('hi'))
    expect(r.ok).toBe(true)
    const tokenCall = fake.requests.find((q) => q.path.endsWith('/oauth2/v2.0/token'))
    expect(tokenCall?.method).toBe('POST')
    expect(fake.tokensIssued()).toBeGreaterThan(0)
  })

  it('a wrong secret is denied at the token step', async () => {
    const r = await putBytes(target('wrong'), 'chiban-export/denied.txt', Buffer.from('hi'))
    expect(r).toMatchObject({ ok: false, error: { kind: 'denied' } })
    expect(fake.files.has('chiban-export/denied.txt')).toBe(false)
  })

  it('first run uploads a small file with a simple put', async () => {
    const bytes = randomBytes(2048)
    const r = await putBytes(target(), 'chiban-export/2026-11/data/parcels.ndjson', bytes)
    expect(r.ok).toBe(true)
    const call = fake.requests.find((q) => q.path.endsWith('parcels.ndjson:/content'))
    expect(call?.method).toBe('PUT')
    expect(call?.headers.authorization).toMatch(/^Bearer /)
    expect(fake.files.get('chiban-export/2026-11/data/parcels.ndjson')).toEqual(bytes)
  })

  it('a 5 MiB file uses an upload session in 3276800-byte chunks', async () => {
    const bytes = randomBytes(5 * 1024 * 1024)
    const before = fake.requests.length
    const r = await putBytes(target(), 'chiban-export/files/big.bin', bytes)
    expect(r.ok).toBe(true)
    expect(fake.sessionsCreated).toContain('chiban-export/files/big.bin')
    const chunkCalls = fake.requests.slice(before).filter((q) => q.path.startsWith('/upload/'))
    expect(chunkCalls.map((q) => q.bytes)).toEqual([CHUNK, bytes.length - CHUNK])
    expect(chunkCalls.map((q) => q.headers['content-range'])).toEqual([
      `bytes 0-${CHUNK - 1}/${bytes.length}`,
      `bytes ${CHUNK}-${bytes.length - 1}/${bytes.length}`,
    ])
    expect(chunkCalls.every((q) => q.headers.authorization === undefined)).toBe(true)
    expect(fake.files.get('chiban-export/files/big.bin')).toEqual(bytes)
  })

  it('second run skips files that exist', async () => {
    const t = target()
    expect(await t.exists('chiban-export/files/big.bin', signal)).toEqual({ ok: true, value: true })
    expect(await t.exists('chiban-export/files/none.bin', signal)).toEqual({
      ok: true,
      value: false,
    })
    const got = await t.get('chiban-export/2026-11/data/parcels.ndjson', signal)
    if (!got.ok) throw new Error('missing')
    expect((await readAll(got.value, 1 << 20)).length).toBe(2048)
    expect(await t.get('chiban-export/none', signal)).toEqual({ ok: false, error: 'not_found' })
  })

  it('a server failure is reported as unreachable', async () => {
    const t = target()
    await t.exists('chiban-export/files/big.bin', signal)
    fake.failNext(503)
    const r = await putBytes(t, 'chiban-export/files/after-failure.bin', Buffer.from('x'))
    expect(r).toMatchObject({ ok: false, error: { kind: 'unreachable' } })
  })

  it('adapter reports stubbed', () => {
    expect(ONEDRIVE_TARGET_STATUS).toBe('stubbed')
  })
})
