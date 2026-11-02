import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { importRuns } from '@/db/schema'
import type { ImportRunReport } from '@/features/gis/import/types'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, PARCEL_MAPPING } from '@/test/gisFixtures'
import { seedParcelWorld, staffActor } from '@/test/parcels'

const state = vi.hoisted(() => ({
  db: null as unknown,
  csrfCookie: 'tok' as string | null,
  actor: null as unknown,
}))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
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

const { POST } = await import('@/app/api/staff/gis-imports/route')

const FIXTURES = path.resolve(import.meta.dirname, '../../../../test/fixtures/gis')
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  await configureLayer(handle.db, 'parcels', PARCEL_MAPPING)
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(() => {
  state.csrfCookie = 'tok'
})

function upload(
  token: string | null,
  file = 'alder-pond-stateplane.zip',
  adapter = 'file_shapefile',
) {
  const form = new FormData()
  if (token !== null) form.set('csrf_token', token)
  form.set('layerKey', 'parcels')
  form.set('adapter', adapter)
  form.set('file', new File([new Uint8Array(readFileSync(path.join(FIXTURES, file)))], file))
  return new Request('https://alderpond.example/api/staff/gis-imports', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/staff/gis-imports', () => {
  it('rejects a missing csrf token', async () => {
    state.actor = await staffActor(handle.db)
    const res = await POST(upload(null))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'csrf' })
  })

  it('rejects an applicant with 403', async () => {
    state.actor = await staffActor(handle.db, 'applicant')
    expect((await POST(upload('tok'))).status).toBe(403)
  })

  it('rejects a staff user without gis.import with 403', async () => {
    state.actor = await staffActor(handle.db, 'reviewer')
    const res = await POST(upload('tok'))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
  })

  it('rejects an oversized declared body with 413', async () => {
    state.actor = await staffActor(handle.db)
    const req = new Request('https://alderpond.example/api/staff/gis-imports', {
      method: 'POST',
      headers: { 'content-length': String(200 * 1024 * 1024) },
      body: new FormData(),
    })
    expect((await POST(req)).status).toBe(413)
  })

  it('rejects an unreadable file with 400', async () => {
    state.actor = await staffActor(handle.db)
    const res = await POST(upload('tok', 'alder-pond-parcels.geojson', 'file_shapefile'))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'reader', kind: 'malformed' })
  })

  it('upload of a shapefile zip returns a run id and the report invariant holds', async () => {
    state.actor = await staffActor(handle.db)
    const res = await POST(upload('tok'))
    expect(res.status).toBe(200)
    const { runId } = (await res.json()) as { runId: string }
    const [run] = await handle.db.select().from(importRuns).where(eq(importRuns.id, runId))
    const report = run?.report as ImportRunReport
    expect(report.countCreated).toBe(36)
    expect(report.countIn).toBe(
      report.countCreated + report.countApplied + report.countUnchanged + report.countExcepted,
    )
  })
})
