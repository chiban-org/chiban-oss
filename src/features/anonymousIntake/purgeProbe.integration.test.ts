import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import {
  anonymousIntakeProbeTokens,
  anonymousIntakeVerifications,
  complaints,
  documents,
  documentVersions,
  enforcementCases,
  files,
  townSettings,
} from '@/db/schema'
import { handleAnonymousIntake } from '@/features/anonymousIntake/handler'
import { purgeProbes } from '@/features/anonymousIntake/purgeProbe'
import { issueProbeToken } from '@/features/anonymousIntake/staffControl'
import type { ObjectStore } from '@/features/storage/objectStore'
import { createRateLimiter } from '@/server/rateLimiter'
import { openAnonymousIntake } from '@/test/anonymousFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld } from '@/test/parcels'

const signal = new AbortController().signal
const NOW = new Date('2027-03-02T15:00:00Z')
const ORIGIN = new URL(env.BASE_URL).origin
let handle: TestDb
let store: ObjectStore

const photo = readFileSync(
  fileURLToPath(new URL('../../test/fixtures/anonymous/gps-artist.jpg', import.meta.url)),
)

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  store = (await makeTestStore()).store
  await openAnonymousIntake(handle.db)
})
afterEach(async () => {
  await handle.drop()
})

async function submit(headers: Record<string, string> = {}, withPhoto = true) {
  const form = new FormData()
  form.append('location', '14 Birch Lane')
  form.append('description', 'A shed with no permit')
  if (withPhoto)
    form.append('photos', new File([new Uint8Array(photo)], 'a.jpg', { type: 'image/jpeg' }))
  return await handleAnonymousIntake(
    {
      db: handle.db,
      store,
      now: () => NOW,
      limiter: createRateLimiter({ max: 50, windowMs: 1000 }),
      imageRef: null,
      appVersion: '0.0.0',
    },
    new Request(`${ORIGIN}/intake/anonymous`, { method: 'POST', body: form, headers }),
    signal,
  )
}

describe('probe submissions', () => {
  it('a request carrying a live probe token marks the complaint as a probe', async () => {
    const token = await issueProbeToken(handle.db, NOW)
    expect((await submit({ 'x-chiban-probe': token })).status).toBe(303)
    const [row] = await handle.db.select().from(complaints)
    expect(row?.isProbe).toBe(true)
  })

  it('a live probe token is accepted while intake is closed, so the first verification can run', async () => {
    await handle.db.update(townSettings).set({ anonymousIntakeEnabled: false })
    await handle.db.delete(anonymousIntakeVerifications)
    const token = await issueProbeToken(handle.db, NOW)
    expect((await submit({ 'x-chiban-probe': token })).status).toBe(303)
    expect((await submit()).status).toBe(404)
  })

  it('an unknown or expired probe token does not mark the complaint', async () => {
    await submit({ 'x-chiban-probe': 'not-a-real-token' })
    const old = await issueProbeToken(handle.db, new Date('2020-01-01T00:00:00Z'))
    await submit({ 'x-chiban-probe': old })
    expect((await handle.db.select().from(complaints)).map((c) => c.isProbe)).toEqual([
      false,
      false,
    ])
  })

  it('purge deletes only probe rows, their documents, and blobs no other row references', async () => {
    await submit({}, false)
    const real = await submit()
    expect(real.status).toBe(303)
    const token = await issueProbeToken(handle.db, NOW)
    await submit({ 'x-chiban-probe': token })
    const before = {
      complaints: (await handle.db.select().from(complaints)).length,
      cases: (await handle.db.select().from(enforcementCases)).length,
    }
    expect(before).toEqual({ complaints: 3, cases: 3 })
    await purgeProbes(handle.db, store, token, signal)
    expect(await handle.db.select().from(complaints)).toHaveLength(2)
    expect(await handle.db.select().from(enforcementCases)).toHaveLength(2)
    expect((await handle.db.select().from(complaints)).every((c) => !c.isProbe)).toBe(true)
    expect(await handle.db.select().from(documents)).toHaveLength(1)
    expect(await handle.db.select().from(anonymousIntakeProbeTokens)).toHaveLength(0)
    const [version] = await handle.db.select().from(documentVersions)
    const [file] = await handle.db.select().from(files)
    expect(file?.sha256).toBe(version?.fileSha256)
    const stream = await store.getStream(file?.storageKey ?? '', signal)
    expect(stream.ok).toBe(true)
  })

  it('purge removes the blob when only the probe referenced it', async () => {
    const token = await issueProbeToken(handle.db, NOW)
    await submit({ 'x-chiban-probe': token })
    const [file] = await handle.db.select().from(files)
    await purgeProbes(handle.db, store, token, signal)
    expect(await handle.db.select().from(files)).toHaveLength(0)
    expect((await store.head(file?.storageKey ?? '', signal)).ok).toBe(false)
  })

  it('document versions stay insert-only outside a probe purge', async () => {
    await submit()
    await expect(handle.db.delete(documentVersions)).rejects.toThrow()
    await expect(
      handle.db.update(documentVersions).set({ filename: 'edited.jpg' }),
    ).rejects.toThrow()
    expect(await handle.db.select().from(documentVersions)).toHaveLength(1)
  })
})
