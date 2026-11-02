import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { files } from '@/db/schema'
import { createBackup } from '@/features/backup/createBackup'
import { createLocalFsTarget } from '@/features/export/targets/localFs'
import { getObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedFormats, seedTown } from '@/test/parcels'

const signal = new AbortController().signal
const store = getObjectStore()
let handle: TestDb
let root: string
let missingKey: string

beforeAll(async () => {
  handle = await makeTestDb()
  await seedFormats(handle.db)
  await seedTown(handle.db)
  const bytes = Buffer.from(`referenced then deleted ${crypto.randomUUID()}`)
  const sha = createHash('sha256').update(bytes).digest('hex')
  missingKey = `blobs/sha256/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`
  await store.putBytes(missingKey, bytes, 'text/plain', signal)
  await handle.db.insert(files).values({
    sha256: sha,
    sizeBytes: bytes.length,
    contentType: 'text/plain',
    storageKey: missingKey,
  })
  await store.delete(missingKey, signal)
  root = await mkdtemp(join(tmpdir(), 'chiban-backup-missing-'))
}, 120_000)
afterAll(async () => {
  await handle.drop()
})

describe('backup with a referenced object missing from storage', () => {
  it('fails naming the missing key and writes nothing to the target', async () => {
    const result = await createBackup(
      {
        db: handle.db,
        pgDumpPath: 'pg_dump',
        databaseUrl: handle.url,
        store,
        secretKeys: env.CHIBAN_SECRET_KEYS,
        activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
        passphrase: 'correct horse battery staple',
        target: createLocalFsTarget({ root }),
        now: new Date('2027-06-02T16:00:00Z'),
      },
      signal,
    )
    expect(result).toEqual({ ok: false, error: { missingObjects: [missingKey] } })
    expect(existsSync(join(root, 'backups'))).toBe(false)
  }, 120_000)
})
