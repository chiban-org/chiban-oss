import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/config/env'
import {
  auditLog,
  complaints,
  documents,
  documentVersions,
  enforcementCases,
  files,
  sessions,
  townSettings,
} from '@/db/schema'
import { handleAnonymousIntake } from '@/features/anonymousIntake/handler'
import { createSession } from '@/features/auth/session'
import type { ObjectStore, ObjectStoreConfig } from '@/features/storage/objectStore'
import { createRateLimiter, type RateLimiter } from '@/server/rateLimiter'
import { openAnonymousIntake } from '@/test/anonymousFixtures'
import { databaseContains } from '@/test/databaseSearch'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const ADDRESS = '203.0.113.77'
const ORIGIN = new URL(env.BASE_URL).origin
let handle: TestDb
let store: ObjectStore
let storeConfig: ObjectStoreConfig
let limiter: RateLimiter

const photo = (name = 'gps-artist.jpg') =>
  readFileSync(fileURLToPath(new URL(`../../test/fixtures/anonymous/${name}`, import.meta.url)))

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  const made = await makeTestStore()
  store = made.store
  storeConfig = made.config
  limiter = createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000, now: () => NOW.getTime() })
  await openAnonymousIntake(handle.db)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await handle.drop()
})

function post(
  fields: Record<string, string | Buffer | Buffer[]> = {},
  headers: Record<string, string> = {},
): Request {
  const form = new FormData()
  const base = { location: '14 Birch Lane', description: 'A shed with no permit', ...fields }
  for (const [key, value] of Object.entries(base)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      form.append(
        key,
        typeof v === 'string'
          ? v
          : new File([new Uint8Array(v)], 'IMG_9999_front_of_my_house.jpg', { type: 'image/jpeg' }),
      )
    }
  }
  return new Request(`${ORIGIN}/intake/anonymous`, {
    method: 'POST',
    body: form,
    headers: {
      'x-forwarded-for': `10.0.0.1, ${ADDRESS}`,
      'user-agent': 'probe-agent/9.9',
      ...headers,
    },
  })
}

const run = (request: Request) =>
  handleAnonymousIntake(
    { db: handle.db, store, now: () => NOW, limiter, imageRef: null, appVersion: '0.0.0' },
    request,
    signal,
  )

describe('anonymous intake handler', () => {
  it('records an anonymous complaint with a stripped photo and redirects to the received page', async () => {
    const response = await run(post({ photos: photo() }))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/report-anonymously/received?ref=CP-2027-0001')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const [row] = await handle.db.select().from(complaints)
    expect(row).toMatchObject({
      channel: 'anonymous_web',
      createdBy: null,
      complainantName: null,
      complainantEmail: null,
      complainantPhone: null,
      descriptionOriginal: 'A shed with no permit',
      isProbe: false,
    })
    const [kase] = await handle.db.select().from(enforcementCases)
    expect(kase).toMatchObject({ isPublic: false, status: 'intake' })
    const [doc] = await handle.db.select().from(documents)
    expect(doc).toMatchObject({
      recordKind: 'enforcement_case',
      docKind: 'enforcement_photo',
      isPublic: false,
      createdByKind: 'anonymous_public_intake',
      createdBy: null,
    })
  })

  it('anonymous post with a live session cookie records no user', async () => {
    const staff = await staffActor(handle.db, 'staff')
    await createSession(handle.db, staff.userId, signal)
    const before = await handle.db.select().from(sessions)
    const response = await run(
      post({ photos: photo() }, { cookie: 'chiban_sid=live-session-token' }),
    )
    expect(response.status).toBe(303)
    const [row] = await handle.db.select().from(complaints)
    expect(row?.createdBy).toBeNull()
    const audit = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, 'complaint'))
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ actorKind: 'anonymous_public_intake', actorUserId: null })
    expect(await handle.db.select().from(sessions)).toEqual(before)
  })

  it('stored object key is the blob key and object metadata is empty', async () => {
    await run(post({ photos: photo() }))
    const [version] = await handle.db.select().from(documentVersions)
    expect(version?.filename).toBe('photo-1.jpg')
    const [file] = await handle.db
      .select()
      .from(files)
      .where(eq(files.sha256, version?.fileSha256 ?? ''))
    expect(file?.storageKey).toMatch(/^blobs\/sha256\//)
    const s3 = new S3Client({
      endpoint: storeConfig.endpoint,
      region: storeConfig.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: storeConfig.accessKeyId,
        secretAccessKey: storeConfig.secretAccessKey,
      },
    })
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: storeConfig.bucket, Key: file?.storageKey ?? '' }),
    )
    expect(head.Metadata).toEqual({})
    expect(head.ContentDisposition).toBeUndefined()
    const stream = await store.getStream(file?.storageKey ?? '', signal)
    if (!stream.ok) throw new Error('bytes')
    const bytes = Buffer.from(await new Response(stream.value).arrayBuffer())
    for (const marker of ['probe-exif-artist', 'ProbeCam', 'probe-xmp-creator']) {
      expect(bytes.includes(marker)).toBe(false)
    }
  })

  it('stores no original filename, user agent, or address anywhere in the database', async () => {
    await run(post({ photos: photo() }))
    for (const needle of ['IMG_9999', 'front_of_my_house', 'probe-agent', ADDRESS, '10.0.0.1']) {
      expect(await databaseContains(handle.db, needle)).toEqual([])
    }
  })

  it('sixth post in 15 minutes from one address is 429 and no column anywhere holds the address', async () => {
    for (let i = 0; i < 5; i++) expect((await run(post())).status).toBe(303)
    expect((await run(post())).status).toBe(429)
    expect(await databaseContains(handle.db, ADDRESS)).toEqual([])
    expect(await handle.db.select().from(complaints)).toHaveLength(5)
  })

  it('a different forwarded address has its own allowance', async () => {
    for (let i = 0; i < 5; i++) await run(post())
    const other = await run(post({}, { 'x-forwarded-for': '198.51.100.20' }))
    expect(other.status).toBe(303)
  })

  it('cross-origin post is 403', async () => {
    const response = await run(post({}, { origin: 'https://evil.example' }))
    expect(response.status).toBe(403)
    expect(await handle.db.select().from(complaints)).toHaveLength(0)
  })

  it('a same-origin post is accepted', async () => {
    expect((await run(post({}, { origin: ORIGIN }))).status).toBe(303)
  })

  it('route is 404 when the running build has no passing verification', async () => {
    const response = await handleAnonymousIntake(
      {
        db: handle.db,
        store,
        now: () => NOW,
        limiter,
        imageRef: 'other@sha256:new',
        appVersion: '0.0.0',
      },
      post(),
      signal,
    )
    expect(response.status).toBe(404)
  })

  it('route is 404 while intake is disabled', async () => {
    await handle.db.update(townSettings).set({ anonymousIntakeEnabled: false })
    expect((await run(post())).status).toBe(404)
    expect(await handle.db.select().from(complaints)).toHaveLength(0)
  })

  it('forced failure writes only the error id line', async () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const broken = {
      ...store,
      putBytes: () => Promise.reject(new Error('disk on fire probe-secret')),
    }
    const response = await handleAnonymousIntake(
      {
        db: handle.db,
        store: broken,
        now: () => NOW,
        limiter,
        imageRef: null,
        appVersion: '0.0.0',
      },
      post({ photos: photo() }),
      signal,
    )
    expect(response.status).toBe(500)
    expect(out.mock.calls).toEqual([])
    expect(errWrite.mock.calls.map((c) => String(c[0]))).toEqual([
      'anonymous_intake_failed E_ANON_001\n',
    ])
    expect(await handle.db.select().from(complaints)).toHaveLength(0)
  })

  it.each([
    ['missing description', { description: '' }],
    ['over-long description', { description: 'a'.repeat(5001) }],
    ['missing location', { location: '' }],
    ['six photos', { photos: [photo(), photo(), photo(), photo(), photo(), photo()] }],
    ['a pdf sent as a photo', { photos: [Buffer.from('%PDF-1.4\nprobe')] }],
  ])('%s is 400 and stores nothing', async (_name, fields) => {
    expect((await run(post(fields))).status).toBe(400)
    expect(await handle.db.select().from(complaints)).toHaveLength(0)
    expect(await handle.db.select().from(enforcementCases)).toHaveLength(0)
  })
})
