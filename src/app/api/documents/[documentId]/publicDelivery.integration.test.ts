import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { setAudiences } from '@/features/documents/publish'
import { approveRendition, revokeApproval } from '@/features/renditions/approvals'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'

const state = vi.hoisted((): { db: unknown; store: unknown; actor: unknown } => ({
  db: null,
  store: null,
  actor: null,
}))
vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('@/features/storage/objectStore', async (original) => ({
  ...(await original<typeof import('@/features/storage/objectStore')>()),
  getObjectStore: () => state.store,
}))

const { GET } = await import('@/app/api/documents/[documentId]/route')

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let staff: Actor
let documentId: string
let approvalId: string

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  store = (await makeTestStore()).store
  state.store = store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  const doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
  documentId = doc.documentId
  await setAudiences(handle.db, staff, { documentId, audiences: [] }, signal)
  const redacted = await redactedVersionOf(handle.db, store, staff, doc)
  const approved = await approveRendition(
    handle.db,
    staff,
    { versionId: redacted, purpose: 'public', reviewStatement: STATEMENT },
    signal,
    store,
  )
  if (!approved.ok) throw new Error(`approve ${approved.error}`)
  approvalId = approved.value.approvalId
})
afterAll(async () => {
  await handle.drop()
})

function call() {
  return GET(new Request(`https://alderpond.example/api/documents/${documentId}`), {
    params: Promise.resolve({ documentId }),
  })
}

describe('public document delivery', () => {
  it('streams the approved copy through the app, sandboxed, so revocation takes effect at once', async () => {
    state.actor = null
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const revoked = await revokeApproval(
      handle.db,
      staff,
      { approvalId, reason: 'Released by mistake' },
      signal,
      store,
    )
    expect(revoked.ok).toBe(true)
    expect((await call()).status).toBe(404)
  })
})
