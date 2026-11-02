import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportTargets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import {
  buildTarget,
  listTargets,
  requestRunNow,
  saveTarget,
  setTargetActive,
} from '@/features/export/targets/manageTargets'
import { decryptSecret } from '@/server/secrets'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb
let admin: Actor
let reviewer: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  reviewer = await staffActor(handle.db, 'reviewer')
})
afterAll(async () => {
  await handle.drop()
})

const s3Input = {
  kind: 's3' as const,
  name: 'Town bucket',
  dayOfMonth: 3,
  settings: {
    endpoint: 'https://s3.example.org',
    bucket: 'town-copy',
    prefix: '/export',
    region: 'us-east-1',
  },
  credentials: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'super-secret-key' },
}

describe('export targets', () => {
  it('an admin adds a local folder target and the list never shows credentials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chiban-manage-'))
    const saved = await saveTarget(
      handle.db,
      admin,
      {
        kind: 'local_fs',
        name: 'Town server',
        dayOfMonth: 1,
        settings: { root },
        credentials: null,
      },
      signal,
    )
    expect(saved.ok).toBe(true)
    const listed = await listTargets(handle.db, admin, signal)
    if (!listed.ok) throw new Error('forbidden')
    expect(listed.value).toHaveLength(1)
    expect(listed.value[0]).toMatchObject({ kind: 'local_fs', name: 'Town server', isActive: true })
    expect(JSON.stringify(listed.value)).not.toContain('credentials')
  })

  it('s3 credentials are stored encrypted and the prefix is normalised', async () => {
    const saved = await saveTarget(handle.db, admin, s3Input, signal)
    if (!saved.ok) throw new Error(saved.error)
    const [row] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.id, saved.value.id))
    expect(row?.credentialsEnc).not.toContain('super-secret-key')
    const plain = decryptSecret(row?.credentialsEnc ?? '')
    expect(plain.ok && JSON.parse(plain.value)).toEqual(s3Input.credentials)
    expect(row?.settings).toMatchObject({ prefix: 'export/' })
  })

  it('editing without new credentials keeps the stored ones and with new ones replaces them', async () => {
    const saved = await saveTarget(handle.db, admin, { ...s3Input, name: 'Edit me' }, signal)
    if (!saved.ok) throw new Error(saved.error)
    const edit = {
      ...s3Input,
      id: saved.value.id,
      name: 'Renamed',
      dayOfMonth: 9,
      credentials: null,
    }
    expect((await saveTarget(handle.db, admin, edit, signal)).ok).toBe(true)
    const [kept] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.id, saved.value.id))
    expect(kept).toMatchObject({ name: 'Renamed', dayOfMonth: 9 })
    const keptPlain = decryptSecret(kept?.credentialsEnc ?? '')
    expect(keptPlain.ok && JSON.parse(keptPlain.value)).toEqual(s3Input.credentials)
    const replaced = {
      ...edit,
      credentials: { accessKeyId: 'NEW', secretAccessKey: 'newer-secret' },
    }
    expect((await saveTarget(handle.db, admin, replaced, signal)).ok).toBe(true)
    const [after] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.id, saved.value.id))
    const afterPlain = decryptSecret(after?.credentialsEnc ?? '')
    expect(afterPlain.ok && JSON.parse(afterPlain.value)).toMatchObject({ accessKeyId: 'NEW' })
  })

  it('a onedrive target needs a tenant, client, drive and secret', async () => {
    const input = {
      kind: 'onedrive' as const,
      name: 'Town OneDrive',
      dayOfMonth: 5,
      settings: {
        tenantId: '11111111-2222-4333-8444-555555555555',
        clientId: 'client-1',
        driveId: 'drive-1',
      },
      credentials: { clientSecret: 'graph-secret' },
    }
    expect((await saveTarget(handle.db, admin, input, signal)).ok).toBe(true)
    const missing = await saveTarget(handle.db, admin, { ...input, credentials: null }, signal)
    expect(missing).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('rejects settings that do not fit the kind', async () => {
    const bad = [
      {
        kind: 'local_fs' as const,
        name: 'x',
        dayOfMonth: 1,
        settings: { root: 'relative/path' },
        credentials: null,
      },
      { ...s3Input, dayOfMonth: 29 },
      { ...s3Input, settings: { ...s3Input.settings, endpoint: 'not a url' } },
      { ...s3Input, name: '' },
    ]
    for (const input of bad) {
      expect(await saveTarget(handle.db, admin, input, signal)).toEqual({
        ok: false,
        error: 'invalid_input',
      })
    }
  })

  it('refuses a local folder that cannot be written, with its own error', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'chiban-ro-'))
    const file = join(parent, 'a-file')
    await writeFile(file, 'x')
    const locked = await mkdtemp(join(tmpdir(), 'chiban-locked-'))
    await chmod(locked, 0o500)
    for (const root of [file, locked, join(locked, 'inner'), '/chiban-no-such-root/x']) {
      const result = await saveTarget(
        handle.db,
        admin,
        { kind: 'local_fs', name: 'x', dayOfMonth: 1, settings: { root }, credentials: null },
        signal,
      )
      expect(result, root).toEqual({ ok: false, error: 'folder_not_writable' })
    }
    await chmod(locked, 0o700)
  })

  it('refuses a malformed Microsoft tenant ID and accepts a GUID or a domain', async () => {
    const base = {
      kind: 'onedrive' as const,
      name: 'T',
      dayOfMonth: 5,
      settings: { tenantId: 'x', clientId: 'client-1', driveId: 'drive-1' },
      credentials: { clientSecret: 'graph-secret' },
    }
    for (const tenantId of ['t', 'not a tenant!', 'tenant-1', '../etc']) {
      expect(
        await saveTarget(
          handle.db,
          admin,
          { ...base, settings: { ...base.settings, tenantId } },
          signal,
        ),
      ).toEqual({ ok: false, error: 'tenant_id_malformed' })
    }
    for (const tenantId of ['11111111-2222-4333-8444-555555555555', 'contoso.onmicrosoft.com']) {
      const saved = await saveTarget(
        handle.db,
        admin,
        { ...base, settings: { ...base.settings, tenantId } },
        signal,
      )
      expect(saved.ok, tenantId).toBe(true)
    }
  })

  it('deactivates and reactivates a target, and run now needs an active one', async () => {
    const saved = await saveTarget(handle.db, admin, { ...s3Input, name: 'Toggle' }, signal)
    if (!saved.ok) throw new Error(saved.error)
    const id = saved.value.id
    expect((await requestRunNow(handle.db, admin, id, signal)).ok).toBe(true)
    const [flagged] = await handle.db.select().from(exportTargets).where(eq(exportTargets.id, id))
    expect(flagged?.runRequestedAt).not.toBeNull()
    expect((await setTargetActive(handle.db, admin, id, false, signal)).ok).toBe(true)
    const [off] = await handle.db.select().from(exportTargets).where(eq(exportTargets.id, id))
    expect(off).toMatchObject({ isActive: false, runRequestedAt: null })
    expect(await requestRunNow(handle.db, admin, id, signal)).toEqual({
      ok: false,
      error: 'not_active',
    })
    expect((await setTargetActive(handle.db, admin, id, true, signal)).ok).toBe(true)
  })

  it('a reviewer is refused every operation', async () => {
    const [row] = await handle.db.select().from(exportTargets).limit(1)
    const id = row?.id ?? ''
    expect(await listTargets(handle.db, reviewer, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await saveTarget(handle.db, reviewer, s3Input, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await saveTarget(handle.db, reviewer, { ...s3Input, id }, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await setTargetActive(handle.db, reviewer, id, false, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect(await requestRunNow(handle.db, reviewer, id, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    const [after] = await handle.db.select().from(exportTargets).where(eq(exportTargets.id, id))
    expect(after?.isActive).toBe(true)
  })

  it('builds a working target from a stored row', async () => {
    const root = await mkdtemp(join(tmpdir(), 'chiban-build-'))
    const saved = await saveTarget(
      handle.db,
      admin,
      { kind: 'local_fs', name: 'Built', dayOfMonth: 1, settings: { root }, credentials: null },
      signal,
    )
    if (!saved.ok) throw new Error(saved.error)
    const [row] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.id, saved.value.id))
    const built = buildTarget(row as typeof exportTargets.$inferSelect, {
      fetch,
      now: () => new Date(),
    })
    if (!built.ok) throw new Error(built.error)
    expect(built.value.kind).toBe('local_fs')
    await built.value.put('a/b.txt', Readable.from([Buffer.from('ok')]), 2, signal)
    expect((await readFile(join(root, 'a/b.txt'))).toString()).toBe('ok')
    const broken = buildTarget(
      { ...(row as typeof exportTargets.$inferSelect), settings: { root: 'nope' } },
      { fetch, now: () => new Date() },
    )
    expect(broken).toEqual({ ok: false, error: 'bad_settings' })
  })
})
