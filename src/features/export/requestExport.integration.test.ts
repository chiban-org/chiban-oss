import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auditLog, exportsTable, townSettings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

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
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { listExports, requestExport } = await import('@/features/export/requestExport')
const { buildBusinessExport } = await import('@/jobs/exportsBuild')
const { getObjectStore } = await import('@/features/storage/objectStore')
const { guardAction } = await import('@/server/actionGuard')
const { GET: downloadRoute } = await import(
  '@/app/(staff)/staff/admin/export/[exportId]/download/route'
)
const { getPublicParcelView } = await import('@/features/parcels/publicParcelView')

const signal = new AbortController().signal
let handle: TestDb
let admin: Actor
let custodian: Actor
let staff: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  custodian = await staffActor(handle.db, 'records_custodian')
  staff = await staffActor(handle.db, 'staff')
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(async () => {
  await handle.db.delete(exportsTable)
  await handle.db.update(townSettings).set({ serviceStatus: 'active', serviceStatusSince: null })
})

async function readyExport(actor: Actor): Promise<string> {
  const requested = await requestExport(handle.db, actor, signal)
  if (!requested.ok) throw new Error(requested.error)
  const built = await buildBusinessExport(
    handle.db,
    getObjectStore(),
    requested.value.exportId,
    signal,
  )
  expect(built.ok).toBe(true)
  return requested.value.exportId
}

function form(): FormData {
  const f = new FormData()
  f.set('csrf_token', 'tok')
  return f
}

describe('self-service export', () => {
  it('admin requests an export and downloads it through a 60-second link', async () => {
    const id = await readyExport(admin)
    state.actor = admin
    const res = await downloadRoute(new Request('https://alderpond.example/x'), {
      params: Promise.resolve({ exportId: id }),
    })
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(new URL(location).searchParams.get('X-Amz-Expires')).toBe('60')
    expect(new URL(location).pathname.endsWith('.zip')).toBe(true)
    const bytes = new Uint8Array(await (await fetch(location)).arrayBuffer())
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(new TextDecoder().decode(bytes.subarray(30, 43))).toBe('manifest.json')
  })

  it('records custodian can export; staff is forbidden', async () => {
    const ok = await requestExport(handle.db, custodian, signal)
    expect(ok.ok).toBe(true)
    await handle.db.delete(exportsTable)
    expect(await requestExport(handle.db, staff, signal)).toEqual({ ok: false, error: 'forbidden' })
    expect(await listExports(handle.db, staff, signal)).toEqual({ ok: false, error: 'forbidden' })
    state.actor = staff
    const res = await downloadRoute(new Request('https://alderpond.example/x'), {
      params: Promise.resolve({ exportId: crypto.randomUUID() }),
    })
    expect(res.status).toBe(403)
  })

  it('a second request while one runs is export_running', async () => {
    const first = await requestExport(handle.db, admin, signal)
    expect(first.ok).toBe(true)
    expect(await requestExport(handle.db, admin, signal)).toEqual({
      ok: false,
      error: 'export_running',
    })
  })

  it('every download writes an audit row', async () => {
    const id = await readyExport(admin)
    state.actor = admin
    for (let i = 0; i < 2; i += 1) {
      await downloadRoute(new Request('https://alderpond.example/x'), {
        params: Promise.resolve({ exportId: id }),
      })
    }
    const rows = await handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'export.downloaded'), eq(auditLog.entityId, id)))
    expect(rows).toHaveLength(2)
    expect(rows[0]?.entityId).toBe(id)
    expect(rows[0]?.actorUserId).toBe(admin.userId)
  })

  it('export only mode refuses mutations but serves export and public lookup', async () => {
    await handle.db.update(townSettings).set({
      serviceStatus: 'terminated',
      serviceStatusSince: '2020-01-01',
      exportWindowDays: 36500,
    })
    state.actor = admin
    expect(await guardAction(form(), signal)).toEqual({ ok: false, error: 'service_inactive' })
    const exempt = await guardAction(form(), signal, { exempt: 'export' })
    expect(exempt.ok).toBe(true)
    const session = await guardAction(form(), signal, { exempt: 'session' })
    expect(session.ok).toBe(true)
    const id = await readyExport(admin)
    const res = await downloadRoute(new Request('https://alderpond.example/x'), {
      params: Promise.resolve({ exportId: id }),
    })
    expect(res.status).toBe(302)
    const parcelId = await makeParcel(handle.db, [{ format: 'gis12', value: '000000000099' }])
    const lookup = await getPublicParcelView(handle.db, parcelId, new Date(), signal)
    expect(lookup.ok).toBe(true)
  })

  it('after the window closes only sign-in and sign-out pass the guard and downloads are refused', async () => {
    const id = await readyExport(admin)
    await handle.db.update(townSettings).set({
      serviceStatus: 'terminated',
      serviceStatusSince: '2020-01-01',
      exportWindowDays: 30,
    })
    state.actor = admin
    expect(await guardAction(form(), signal, { exempt: 'export' })).toEqual({
      ok: false,
      error: 'service_inactive',
    })
    expect((await guardAction(form(), signal, { exempt: 'session' })).ok).toBe(true)
    const res = await downloadRoute(new Request('https://alderpond.example/x'), {
      params: Promise.resolve({ exportId: id }),
    })
    expect(res.status).toBe(403)
  })
})
