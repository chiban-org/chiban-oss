import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportTargets } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  csrfCookie: string | null
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, csrfCookie: 'tok', actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'chiban_csrf' && state.csrfCookie !== null
          ? { value: state.csrfCookie }
          : undefined,
    }),
  headers: () =>
    Promise.resolve(
      new Headers({
        origin: 'https://alderpond.example',
        host: 'alderpond.example',
        'sec-fetch-site': 'same-origin',
      }),
    ),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const actions = await import('./actions')

let handle: TestDb
let admin: Actor
let reviewer: Actor

function form(fields: Record<string, string>): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}

const LOCAL = { kind: 'local_fs', name: 'Town server', dayOfMonth: '3', root: '/srv/chiban-copy' }
const S3 = {
  kind: 's3',
  name: 'Bucket',
  dayOfMonth: '7',
  endpoint: 'https://s3.example.org',
  bucket: 'town',
  prefix: 'chiban',
  region: 'us-east-1',
  accessKeyId: 'AKIA',
  secretAccessKey: 'shh',
}
const ONEDRIVE = {
  kind: 'onedrive',
  name: 'Clerk drive',
  dayOfMonth: '9',
  tenantId: 't',
  clientId: 'c',
  driveId: 'd',
  clientSecret: 'graph-secret',
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  reviewer = await staffActor(handle.db, 'reviewer')
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
  state.actor = admin
})

describe('export target actions', () => {
  it('an admin adds one target of each kind', async () => {
    for (const fields of [LOCAL, S3, ONEDRIVE]) {
      const result = await actions.saveTargetAction(form(fields))
      expect(result.ok, JSON.stringify(result)).toBe(true)
    }
    const rows = await handle.db.select().from(exportTargets)
    expect(rows.map((r) => r.kind).sort()).toEqual(['local_fs', 'onedrive', 's3'])
  })

  it('editing with blank credentials keeps them and a bad value is explained', async () => {
    const [row] = await handle.db.select().from(exportTargets).where(eq(exportTargets.kind, 's3'))
    const edited = await actions.saveTargetAction(
      form({ ...S3, id: row?.id ?? '', name: 'Renamed', accessKeyId: '', secretAccessKey: '' }),
    )
    expect(edited.ok).toBe(true)
    const [after] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.id, row?.id ?? ''))
    expect(after).toMatchObject({ name: 'Renamed', credentialsEnc: row?.credentialsEnc })
    const bad = await actions.saveTargetAction(form({ ...LOCAL, dayOfMonth: '31' }))
    expect(bad).toEqual({ ok: false, error: 'Check the form fields and try again.' })
  })

  it('turns a target off and back on and queues a run for an active one', async () => {
    const [row] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.kind, 'local_fs'))
    const id = row?.id ?? ''
    expect((await actions.runTargetNowAction(form({ id }))).ok).toBe(true)
    expect((await actions.setTargetActiveAction(form({ id, active: 'false' }))).ok).toBe(true)
    const off = await actions.runTargetNowAction(form({ id }))
    expect(off.ok).toBe(false)
    expect((await actions.setTargetActiveAction(form({ id, active: 'true' }))).ok).toBe(true)
  })

  it('a reviewer is refused on every action and nothing changes', async () => {
    state.actor = reviewer
    const [row] = await handle.db
      .select()
      .from(exportTargets)
      .where(eq(exportTargets.kind, 'local_fs'))
    const id = row?.id ?? ''
    const before = await handle.db.select().from(exportTargets)
    const results = [
      await actions.saveTargetAction(form({ ...LOCAL, name: 'Sneaky' })),
      await actions.saveTargetAction(form({ ...LOCAL, id, name: 'Sneaky' })),
      await actions.setTargetActiveAction(form({ id, active: 'false' })),
      await actions.runTargetNowAction(form({ id })),
    ]
    for (const r of results) {
      expect(r).toEqual({ ok: false, error: 'You do not have permission to do this.' })
    }
    expect(await handle.db.select().from(exportTargets)).toEqual(before)
  })

  it('a signed-out caller and a missing CSRF token are refused', async () => {
    state.actor = null
    expect((await actions.saveTargetAction(form(LOCAL))).ok).toBe(false)
    state.actor = admin
    state.csrfCookie = null
    expect((await actions.saveTargetAction(form(LOCAL))).ok).toBe(false)
  })
})
