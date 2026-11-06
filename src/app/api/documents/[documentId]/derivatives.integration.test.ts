import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { setPublic } from '@/features/documents/publish'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { staffActor } from '@/test/parcels'
import { redactionFixture } from '@/test/redactionFixtures'
import { approvePublic } from '@/test/renditionFixtures'

const state = vi.hoisted((): { db: unknown; actor: unknown; store: unknown } => ({
  db: null,
  actor: null,
  store: null,
}))
vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('@/features/storage/objectStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/storage/objectStore')>()),
  getObjectStore: () => state.store,
}))

const thumbnail = await import('@/app/api/documents/[documentId]/thumbnail/route')
const preview = await import('@/app/api/documents/[documentId]/preview/[page]/route')
const download = await import('@/app/api/documents/[documentId]/route')

let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let privateDoc: { documentId: string; versionId: string }
let publicDoc: { documentId: string; versionId: string }
let stranger: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  state.store = store
  const appId = (await makeApplication(handle.db, world)).applicationId
  const target = { kind: 'application' as const, id: appId }
  privateDoc = await uploadAs(
    handle.db,
    store,
    world.applicant,
    target,
    redactionFixture('letter.pdf'),
    {
      title: 'Private letter',
    },
  )
  publicDoc = await uploadAs(
    handle.db,
    store,
    world.applicant,
    target,
    redactionFixture('letter.pdf'),
    {
      title: 'Public letter',
    },
  )
  await approvePublic(handle.db, world.staff, publicDoc.versionId, store)
  await setPublic(
    handle.db,
    world.staff,
    { documentId: publicDoc.documentId, isPublic: true },
    new AbortController().signal,
  )
  stranger = await staffActor(handle.db, 'applicant')
})
afterAll(async () => {
  await handle.drop()
})

const thumb = (id: string) =>
  thumbnail.GET(new Request(`https://alderpond.example/api/documents/${id}/thumbnail`), {
    params: Promise.resolve({ documentId: id }),
  })
const prev = (id: string, page: string) =>
  preview.GET(new Request(`https://alderpond.example/api/documents/${id}/preview/${page}`), {
    params: Promise.resolve({ documentId: id, page }),
  })
const dl = (id: string) =>
  download.GET(new Request(`https://alderpond.example/api/documents/${id}`), {
    params: Promise.resolve({ documentId: id }),
  })

describe('derived image routes', () => {
  it('thumbnail for an applicant party is derived from the original', async () => {
    state.actor = world.applicant
    const res = await thumb(privateDoc.documentId)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('etag')).toBe(`"${privateDoc.versionId}-thumbnail-1"`)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(new Uint8Array(await res.arrayBuffer()).slice(1, 4)).toEqual(
      new Uint8Array([80, 78, 71]),
    )
  })

  it('another applicant and anonymous visitors get 404 for a private document', async () => {
    state.actor = stranger
    expect((await thumb(privateDoc.documentId)).status).toBe(404)
    expect((await prev(privateDoc.documentId, '1')).status).toBe(404)
    state.actor = null
    expect((await thumb(privateDoc.documentId)).status).toBe(404)
    expect((await prev(privateDoc.documentId, '1')).status).toBe(404)
  })

  it('anonymous visitors get the thumbnail and preview of a public document with an approved version', async () => {
    state.actor = null
    const res = await thumb(publicDoc.documentId)
    expect(res.status).toBe(200)
    expect(res.headers.get('etag')).toBe(`"${publicDoc.versionId}-thumbnail-1"`)
    const page = await prev(publicDoc.documentId, '1')
    expect(page.status).toBe(200)
    expect(page.headers.get('cache-control')).toBe('no-store')
  })

  it('a preview past the last page, a bad page, and a malformed id are 404', async () => {
    state.actor = world.applicant
    expect((await prev(privateDoc.documentId, '2')).status).toBe(404)
    expect((await prev(privateDoc.documentId, '0')).status).toBe(404)
    expect((await prev(privateDoc.documentId, 'x')).status).toBe(404)
    expect((await thumb('not-a-uuid')).status).toBe(404)
  })

  it('document route sends no-store', async () => {
    state.actor = world.applicant
    const ok = await dl(privateDoc.documentId)
    expect(ok.status).toBe(302)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    state.actor = null
    const missing = await dl(privateDoc.documentId)
    expect(missing.status).toBe(404)
    expect(missing.headers.get('cache-control')).toBe('no-store')
  })
})
