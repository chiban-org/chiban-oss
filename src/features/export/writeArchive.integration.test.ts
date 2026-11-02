import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Tx } from '@/db/client'
import { exportsTable, files, parcels, users } from '@/db/schema'
import { EXPORT_ENTITIES } from '@/features/export/entities'
import { renderFormatDoc } from '@/features/export/formatDoc'
import { pruneExpiredExports } from '@/features/export/pruneExports'
import { writeArchive } from '@/features/export/writeArchive'
import { getObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedExportTown } from '@/test/exportFixtures'
import { memoryArchive } from '@/test/memoryArchive'
import { makeParcel } from '@/test/parcels'

const signal = new AbortController().signal
const store = getObjectStore()
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await seedExportTown(handle.db, signal)
}, 240_000)
afterAll(async () => {
  await handle.drop()
})

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function archive(db = handle.db, base = null as Parameters<typeof writeArchive>[2]['base']) {
  const out = memoryArchive()
  const manifest = await writeArchive(
    db,
    store,
    { exportId: crypto.randomUUID(), kind: 'business', base },
    out.sink,
    signal,
  )
  return { manifest, entries: out.entries, order: out.order }
}

describe('writeArchive', () => {
  it('manifest is the first tar entry and manifest.sha256 matches it', async () => {
    const { entries, order } = await archive()
    expect(order[0]).toBe('manifest.json')
    expect(order[1]).toBe('manifest.sha256')
    const manifestBytes = entries.get('manifest.json')
    expect(manifestBytes).toBeDefined()
    expect(entries.get('manifest.sha256')?.toString('utf8')).toBe(
      `${sha(manifestBytes ?? Buffer.alloc(0))}  manifest.json\n`,
    )
  })

  it('every entity hash matches its bytes and every count matches the table', async () => {
    const { manifest, entries } = await archive()
    expect(manifest.entities).toHaveLength(EXPORT_ENTITIES.length)
    for (const entry of manifest.entities) {
      const bytes = entries.get(entry.path)
      expect(bytes, entry.path).toBeDefined()
      expect(sha(bytes ?? Buffer.alloc(0))).toBe(entry.sha256)
      const lines = (bytes ?? Buffer.alloc(0)).toString('utf8').split('\n').filter(Boolean)
      expect(lines).toHaveLength(entry.count)
      const table = await handle.db.execute<{ n: number }>(
        sql.raw(`select count(*)::int as n from "${entry.name}"`),
      )
      expect(table.rows[0]?.n).toBe(entry.count)
    }
  })

  it('each file appears once although two documents reference it', async () => {
    const second = await handle.db.execute<{ id: string }>(sql`
      insert into documents (record_kind, record_id, title, doc_kind, created_by_kind)
      select record_kind, record_id, 'Second reference', 'attachment', 'system' from documents limit 1
      returning id`)
    await handle.db.execute(sql`
      insert into document_versions (document_id, role, file_sha256, filename, content_type)
      select ${second.rows[0]?.id}, 'original', file_sha256, filename, content_type
      from document_versions where role = 'original' limit 1`)
    const [shared] = (
      await handle.db.execute<{ sha: string }>(
        sql`select file_sha256 as sha from document_versions group by file_sha256 having count(*) > 1 limit 1`,
      )
    ).rows
    expect(shared).toBeDefined()
    const { manifest, entries } = await archive()
    const path = `files/sha256/${shared?.sha.slice(0, 2)}/${shared?.sha.slice(2, 4)}/${shared?.sha}`
    expect(manifest.files.filter((f) => f.sha256 === shared?.sha)).toHaveLength(1)
    expect(entries.has(path)).toBe(true)
    const total = (await handle.db.select().from(files)).length
    expect(manifest.files).toHaveLength(total)
    for (const f of manifest.files)
      expect(sha(entries.get(f.path) ?? Buffer.alloc(0))).toBe(f.sha256)
  })

  it('two exports of an unchanged town have identical entity hashes', async () => {
    const a = await archive()
    const b = await archive()
    expect(a.manifest.entities.map((e) => e.sha256)).toEqual(
      b.manifest.entities.map((e) => e.sha256),
    )
  })

  it('rows written during an export do not appear in it', async () => {
    const racing = new Proxy(handle.db, {
      get(target, prop, receiver) {
        if (prop !== 'transaction') return Reflect.get(target, prop, receiver) as unknown
        return async (cb: (tx: Tx) => Promise<unknown>, config: never) =>
          await target.transaction(async (tx) => {
            await tx.execute(sql`select 1`)
            await makeParcel(target, [{ format: 'gis12', value: '999999999999' }])
            return await cb(tx)
          }, config)
      },
    })
    const before = (await handle.db.select().from(parcels)).length
    const { manifest } = await archive(racing)
    expect(manifest.entities.find((e) => e.name === 'parcels')?.count).toBe(before)
    expect((await handle.db.select().from(parcels)).length).toBe(before + 1)
  })

  it('password hashes, totp secrets, and processor credentials appear nowhere in the archive bytes', async () => {
    await handle.db
      .update(users)
      .set({ passwordHash: 'scrypt$SECRETPASSWORDHASHVALUE', totpSecretEnc: 'v1:SECRETTOTPVALUE' })
      .where(eq(users.email, 'admin@alderpond.example'))
    await handle.db.execute(sql`
      insert into processor_accounts (processor, mode, account_ref, credentials_enc, webhook_secret_enc, created_by)
      values ('stripe', 'test', 'acct_x', 'v1:SECRETCREDENTIALS', 'v1:SECRETWEBHOOK', gen_random_uuid())`)
    const { entries } = await archive()
    const everything = Buffer.concat([...entries.values()]).toString('latin1')
    for (const secret of [
      'SECRETPASSWORDHASHVALUE',
      'SECRETTOTPVALUE',
      'SECRETCREDENTIALS',
      'SECRETWEBHOOK',
    ]) {
      expect(everything.includes(secret), secret).toBe(false)
    }
    await handle.db.execute(sql`delete from processor_accounts where account_ref = 'acct_x'`)
  })

  it('docs/export-format.md matches renderFormatDoc output', () => {
    const onDisk = readFileSync(new URL('../../../docs/export-format.md', import.meta.url), 'utf8')
    expect(onDisk).toBe(renderFormatDoc(EXPORT_ENTITIES))
  })

  it('FORMAT.md inside the archive is the same text', async () => {
    const { entries } = await archive()
    expect(entries.get('FORMAT.md')?.toString('utf8')).toBe(renderFormatDoc(EXPORT_ENTITIES))
  })

  it('prune expires a 7-day-old export and deletes its object', async () => {
    const key = `exports/${crypto.randomUUID()}/old.tar`
    await store.putBytes(key, Buffer.from('x'), 'application/x-tar', signal)
    const [row] = await handle.db
      .insert(exportsTable)
      .values({
        kind: 'business',
        status: 'ready',
        storageKey: key,
        expiresAt: new Date(Date.now() - 1000),
      })
      .returning()
    await pruneExpiredExports(handle.db, store, new Date(), signal)
    const [after] = await handle.db
      .select()
      .from(exportsTable)
      .where(eq(exportsTable.id, row?.id ?? ''))
    expect(after?.status).toBe('expired')
    expect((await store.head(key, signal)).ok).toBe(false)
  })
})
