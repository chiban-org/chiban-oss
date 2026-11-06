import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { setAudiences } from '@/features/documents/publish'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes, uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { staffActor } from '@/test/parcels'

const state = vi.hoisted((): { db: unknown; actor: unknown } => ({ db: null, actor: null }))
vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))

const { GET } = await import('@/app/api/documents/[documentId]/route')

let handle: TestDb
let world: PermitWorld
let documentId: string
let stranger: Actor

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  const { store } = await makeTestStore()
  const appId = (await makeApplication(handle.db, world)).applicationId
  documentId = (
    await uploadAs(
      handle.db,
      store,
      world.applicant,
      { kind: 'application', id: appId },
      pdfBytes('route'),
    )
  ).documentId
  stranger = await staffActor(handle.db, 'applicant')
})
afterAll(async () => {
  await handle.drop()
})

function call(id: string, query = '') {
  return GET(new Request(`https://alderpond.example/api/documents/${id}${query}`), {
    params: Promise.resolve({ documentId: id }),
  })
}

describe('document download route', () => {
  it('redirects a party to a presigned url', async () => {
    state.actor = world.applicant
    const res = await call(documentId)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('X-Amz-Signature')
  })

  it('answers 404 for another applicant, anonymous visitors, and malformed ids', async () => {
    state.actor = stranger
    expect((await call(documentId)).status).toBe(404)
    state.actor = null
    expect((await call(documentId)).status).toBe(404)
    state.actor = world.applicant
    expect((await call('not-a-uuid')).status).toBe(404)
  })

  it('answers 404 once staff remove the party audience', async () => {
    await setAudiences(
      handle.db,
      world.staff,
      { documentId, audiences: [] },
      new AbortController().signal,
    )
    state.actor = world.applicant
    expect((await call(documentId)).status).toBe(404)
  })
})
