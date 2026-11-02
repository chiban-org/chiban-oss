import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { parcels } from '@/db/schema'
import { importArchive } from '@/features/export/importArchive'
import { manifestChecksumLine } from '@/features/export/manifest'
import { getObjectStore, type ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedExportTown } from '@/test/exportFixtures'
import { buildTar, collectEntries, freshTarget, rebuildTar, sourceOf } from '@/test/roundTrip'

const signal = new AbortController().signal
let source: TestDb
let tar: Buffer

beforeAll(async () => {
  source = await makeTestDb()
  await seedExportTown(source.db, signal)
  tar = await buildTar(source.db, getObjectStore(), signal)
}, 300_000)
afterAll(async () => {
  await source.drop()
})

function rejectingUploads(store: ObjectStore): ObjectStore {
  return {
    ...store,
    async upload(_key, body) {
      for await (const _chunk of body) void _chunk
      throw new Error('store unavailable')
    },
  }
}

async function withEditedManifest(edit: (manifest: Record<string, unknown>) => void) {
  const entries = await collectEntries(tar)
  const manifest = JSON.parse(entries.get('manifest.json')?.toString('utf8') ?? '{}') as Record<
    string,
    unknown
  >
  edit(manifest)
  const bytes = Buffer.from(JSON.stringify(manifest))
  entries.set('manifest.json', bytes)
  entries.set('manifest.sha256', Buffer.from(manifestChecksumLine(bytes)))
  return await rebuildTar(entries)
}

describe('importArchive upload and path safety', () => {
  it('a rejected blob upload fails the import with uploadFailed and commits nothing', async () => {
    const { target, store } = await freshTarget()
    try {
      const result = await importArchive(target.db, rejectingUploads(store), sourceOf(tar), signal)
      expect(result).toMatchObject({ ok: false, error: { uploadFailed: expect.any(String) } })
      expect((await target.db.select().from(parcels)).length).toBe(0)
    } finally {
      await target.drop()
    }
  })

  it('an entity name that climbs out of the work dir is manifest_mismatch and writes nothing outside', async () => {
    const { target, store } = await freshTarget()
    const escaped = join(env.EXPORT_WORK_DIR, 'victim.ndjson')
    await rm(escaped, { force: true })
    try {
      const crafted = await withEditedManifest((manifest) => {
        const entities = manifest.entities as { name: string; path: string }[]
        const first = entities[0]
        if (first !== undefined) first.name = '../victim'
      })
      const result = await importArchive(target.db, store, sourceOf(crafted), signal)
      expect(result).toMatchObject({ ok: false, error: 'manifest_mismatch' })
      expect(existsSync(escaped)).toBe(false)
    } finally {
      await rm(escaped, { force: true })
      await target.drop()
    }
  })

  it('a file path that is not derived from its hash is manifest_mismatch', async () => {
    const { target, store } = await freshTarget()
    try {
      const crafted = await withEditedManifest((manifest) => {
        const list = manifest.files as { path: string }[]
        const first = list[0]
        if (first !== undefined) first.path = '../../escape'
      })
      const result = await importArchive(target.db, store, sourceOf(crafted), signal)
      expect(result).toMatchObject({ ok: false, error: 'manifest_mismatch' })
    } finally {
      await target.drop()
    }
  })
})
