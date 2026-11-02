import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import { and, count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { auditLog, exportsTable, roleCapabilities } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hashPassword } from '@/features/auth/password'
import { currentTotpCode, generateTotpSecret } from '@/features/auth/totp'
import { tarSource } from '@/features/export/readArchive'
import { decryptStream } from '@/features/export/recovery/envelope'
import { encryptSecret } from '@/server/secrets'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeUser } from '@/test/factories'
import { seedParcelWorld } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: 'tok' }) }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))

const { buildRecoveryStream } = await import('@/features/export/recovery/buildRecovery')
const { handleRecoveryForm, handleRecoveryRequest } = await import(
  '@/features/export/recovery/recoveryHandler'
)
const { env } = await import('@/config/env')
const { loadActor } = await import('@/features/auth/actor')

const run = promisify(execFile)
const signal = new AbortController().signal
const PASSWORD = 'a-long-staff-password'
const PASSPHRASE = 'a recovery passphrase of length'
const totpSecret = generateTotpSecret()
let handle: TestDb
let adminActor: Actor
let custodianWithGrant: Actor
let plainStaff: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  const adminId = await makeUser(handle.db, {
    role: 'admin',
    passwordHash: await hashPassword(PASSWORD, signal),
    totpSecretEnc: encryptSecret(totpSecret),
    totpEnabled: true,
  })
  const custodianId = await makeUser(handle.db, {
    role: 'records_custodian',
    passwordHash: await hashPassword(PASSWORD, signal),
  })
  await handle.db
    .insert(roleCapabilities)
    .values({ role: 'records_custodian', capability: 'export.recovery' })
    .onConflictDoNothing()
  const staffId = await makeUser(handle.db, {
    role: 'staff',
    passwordHash: await hashPassword(PASSWORD, signal),
  })
  plainStaff = (await loadActor(handle.db, staffId, signal)) as Actor
  adminActor = (await loadActor(handle.db, adminId, signal)) as Actor
  custodianWithGrant = (await loadActor(handle.db, custodianId, signal)) as Actor
})
afterAll(async () => {
  await handle.drop()
})

function post(fields: Record<string, string>): Promise<Response> {
  const form = new FormData()
  form.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return handleRecoveryRequest(
    new Request('https://alderpond.example/staff/admin/export/recovery', {
      method: 'POST',
      body: form,
    }),
    {
      pgDumpPath: 'pg_dump',
      databaseUrl: handle.url,
      secretKeys: env.CHIBAN_SECRET_KEYS,
      activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
    },
  )
}

function postFromBrowser(fields: Record<string, string>): Promise<Response> {
  const form = new FormData()
  form.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  return handleRecoveryForm(
    new Request('https://alderpond.example/staff/admin/export/recovery', {
      method: 'POST',
      body: form,
      headers: { accept: 'text/html,application/xhtml+xml' },
    }),
    {
      pgDumpPath: 'pg_dump',
      databaseUrl: handle.url,
      secretKeys: env.CHIBAN_SECRET_KEYS,
      activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
    },
  )
}

async function entriesOf(stream: Readable): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>()
  for await (const entry of tarSource(stream).entries()) {
    const chunks: Buffer[] = []
    for await (const c of entry.body) chunks.push(Buffer.from(c as Uint8Array))
    out.set(entry.path, Buffer.concat(chunks))
  }
  return out
}

async function writesSnapshot(): Promise<number[]> {
  const [audits] = await handle.db.select({ n: count() }).from(auditLog)
  const [exportRows] = await handle.db.select({ n: count() }).from(exportsTable)
  return [audits?.n ?? 0, exportRows?.n ?? 0]
}

describe('recovery export', () => {
  it('a crafted POST from plain staff is refused with 403, streams nothing and writes nothing', async () => {
    state.actor = plainStaff
    const before = await writesSnapshot()
    const res = await post({
      password: PASSWORD,
      totp: '000000',
      passphrase: PASSPHRASE,
    })
    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')).not.toBe('application/octet-stream')
    expect(await res.text()).not.toContain('CHIBANREC1')
    expect(await writesSnapshot()).toEqual(before)
  })

  it('a crafted POST from an admin whose role lacks export.recovery is refused and writes nothing', async () => {
    state.actor = adminActor
    await handle.db
      .delete(roleCapabilities)
      .where(
        and(eq(roleCapabilities.role, 'admin'), eq(roleCapabilities.capability, 'export.recovery')),
      )
    try {
      const before = await writesSnapshot()
      const res = await post({
        password: PASSWORD,
        totp: currentTotpCode(totpSecret, Date.now()),
        passphrase: PASSPHRASE,
      })
      expect(res.status).toBe(403)
      expect(res.headers.get('content-type')).not.toBe('application/octet-stream')
      expect(await writesSnapshot()).toEqual(before)
    } finally {
      await handle.db
        .insert(roleCapabilities)
        .values({ role: 'admin', capability: 'export.recovery' })
        .onConflictDoNothing()
    }
  })

  it('recovery tar contains a dump that pg_restore --list accepts and the configured key material', async () => {
    try {
      await run('pg_dump', ['--version'])
    } catch {
      throw new Error('Install postgresql-client 16')
    }
    const stream = buildRecoveryStream(
      {
        pgDumpPath: 'pg_dump',
        databaseUrl: handle.url,
        secretKeys: JSON.parse(JSON.stringify(env.CHIBAN_SECRET_KEYS)) as Record<string, string>,
        activeKeyId: env.CHIBAN_ACTIVE_KEY_ID,
      },
      signal,
    )
    const entries = await entriesOf(stream)
    const dir = await mkdtemp(join(tmpdir(), 'recovery-'))
    await writeFile(join(dir, 'database.dump'), entries.get('database.dump') ?? Buffer.alloc(0))
    const listed = await run('pg_restore', ['--list', join(dir, 'database.dump')])
    expect(listed.stdout).toContain('parcels')
    const secrets = JSON.parse(entries.get('secrets.json')?.toString('utf8') ?? '{}') as Record<
      string,
      string
    >
    expect(JSON.parse(secrets.CHIBAN_SECRET_KEYS ?? '{}')).toEqual(env.CHIBAN_SECRET_KEYS)
    expect(secrets.CHIBAN_ACTIVE_KEY_ID).toBe(env.CHIBAN_ACTIVE_KEY_ID)
    const manifest = JSON.parse(
      entries.get('recovery-manifest.json')?.toString('utf8') ?? '{}',
    ) as Record<string, string>
    expect(manifest.migrationHead).toMatch(/^\d{4}_/)
  })

  it('the route streams an envelope that decrypts to the same tar', async () => {
    state.actor = adminActor
    const res = await post({
      password: PASSWORD,
      totp: currentTotpCode(totpSecret, Date.now()),
      passphrase: PASSPHRASE,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
    expect(res.headers.get('content-disposition')).toMatch(/chiban-recovery-\d{4}-\d{2}-\d{2}\.bin/)
    const sealed = Buffer.from(await res.arrayBuffer())
    const entries = await entriesOf(decryptStream(Readable.from([sealed]), PASSPHRASE))
    expect([...entries.keys()].sort()).toEqual([
      'database.dump',
      'recovery-manifest.json',
      'secrets.json',
    ])
  })

  it('staff with export.recovery granted but no admin role is forbidden', async () => {
    state.actor = custodianWithGrant
    const res = await post({ password: PASSWORD, totp: '000000', passphrase: PASSPHRASE })
    expect(res.status).toBe(403)
  })

  it('wrong totp is invalid_credentials and streams nothing', async () => {
    state.actor = adminActor
    const res = await post({ password: PASSWORD, totp: '000000', passphrase: PASSPHRASE })
    expect(res.status).toBe(401)
    expect(res.headers.get('content-type')).not.toBe('application/octet-stream')
    expect(await res.text()).not.toContain('CHIBANREC1')
  })

  it('passphrase under 16 characters is refused', async () => {
    state.actor = adminActor
    const res = await post({
      password: PASSWORD,
      totp: currentTotpCode(totpSecret, Date.now()),
      passphrase: 'too short',
    })
    expect(res.status).toBe(422)
  })

  it('a browser form post that is refused redirects back to the export page with the error code', async () => {
    state.actor = adminActor
    const res = await postFromBrowser({
      password: PASSWORD,
      totp: '000000',
      passphrase: PASSPHRASE,
    })
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(
      '/staff/admin/export?recovery_error=invalid_credentials',
    )
    state.actor = plainStaff
    const denied = await postFromBrowser({ passphrase: PASSPHRASE })
    expect(denied.headers.get('location')).toBe('/staff/admin/export?recovery_error=forbidden')
  })

  it('a signed-out visitor is refused', async () => {
    state.actor = null
    const res = await post({ password: PASSWORD, totp: '1', passphrase: PASSPHRASE })
    expect(res.status).toBe(403)
  })
})
