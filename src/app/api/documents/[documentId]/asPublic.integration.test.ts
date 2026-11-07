import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { setPublic } from '@/features/documents/publish'
import { summarizeDocuments } from '@/features/documents/recordSource'
import { approveRendition } from '@/features/renditions/approvals'
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

const download = await import('@/app/api/documents/[documentId]/route')
const thumbnail = await import('@/app/api/documents/[documentId]/thumbnail/route')

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let staff: Actor
let documentId: string

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  store = (await makeTestStore()).store
  state.store = store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  const doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
  documentId = doc.documentId
  const redacted = await redactedVersionOf(handle.db, store, staff, doc)
  const approved = await approveRendition(
    handle.db,
    staff,
    { versionId: redacted, purpose: 'public', reviewStatement: STATEMENT },
    signal,
    store,
  )
  if (!approved.ok) throw new Error(`approve ${approved.error}`)
  const shown = await setPublic(handle.db, staff, { documentId, isPublic: true }, signal)
  if (!shown.ok) throw new Error(`show ${shown.error}`)
})
afterAll(async () => {
  await handle.drop()
})

async function bytesOf(path: string, actor: Actor | null): Promise<string> {
  state.actor = actor
  const route = path.includes('/thumbnail') ? thumbnail : download
  const res = await route.GET(new Request(`https://alderpond.example${path}`), {
    params: Promise.resolve({ documentId }),
  })
  if (res.status === 302) return `redirect ${res.headers.get('location') ?? ''}`
  expect(res.status).toBe(200)
  return Buffer.from(await res.arrayBuffer()).toString('base64')
}

describe('a signed-in viewer can ask for the copy the public gets', () => {
  it('serves the approved redacted copy, not the original, when the link asks for the public copy', async () => {
    const original = await bytesOf(`/api/documents/${documentId}`, staff)
    const publicCopy = await bytesOf(`/api/documents/${documentId}`, null)
    expect(publicCopy).not.toBe(original)
    expect(await bytesOf(`/api/documents/${documentId}?as=public`, staff)).toBe(publicCopy)
  })

  it('serves the public thumbnail to a signed-in viewer when the link asks for it', async () => {
    const publicThumb = await bytesOf(`/api/documents/${documentId}/thumbnail`, null)
    expect(await bytesOf(`/api/documents/${documentId}/thumbnail?as=public`, staff)).toBe(
      publicThumb,
    )
  })

  it('links the public parcel page to the public copy and the staff page to the ordinary file', async () => {
    const [shown] = await summarizeDocuments(handle.db, [documentId], { kind: 'public' }, signal)
    expect(shown?.href).toBe(`/api/documents/${documentId}?as=public`)
    expect(shown?.thumbnailHref).toBe(`/api/documents/${documentId}/thumbnail?as=public`)
    const [staffRow] = await summarizeDocuments(
      handle.db,
      [documentId],
      { kind: 'actor', actor: staff },
      signal,
    )
    expect(staffRow?.href).toBe(`/api/documents/${documentId}`)
  })
})
