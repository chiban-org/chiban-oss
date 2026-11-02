import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { boardPacketItems, documentRenditions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { openPacketVersion, sendPacketLink } from '@/features/boards/packetLinks'
import { createPacket } from '@/features/boards/packets'
import { downloadDocument } from '@/features/documents/download'
import { setAudiences } from '@/features/documents/publish'
import { searchPublicDocuments } from '@/features/documents/search'
import { createMemoryTransport } from '@/features/mail/memoryTransport'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { processPreservation } from '@/features/preservation/preserve'
import { approveRendition, revokeApproval } from '@/features/renditions/approvals'
import { deriveRenditions, serveDerivative } from '@/features/renditions/derive'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { activePublicApproval, redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'
import type { CivilDate } from '@/types/civilDate'

const signal = new AbortController().signal
const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})
let handle: TestDb
let store: ObjectStore
let staff: Actor
let doc: { documentId: string; versionId: string }

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
  await setAudiences(handle.db, staff, { documentId: doc.documentId, audiences: [] }, signal)
})
afterEach(async () => {
  await handle.drop()
})

const approve = (versionId: string) =>
  approveRendition(
    handle.db,
    staff,
    { versionId, purpose: 'public', reviewStatement: STATEMENT },
    signal,
    store,
  )

async function revokeActive(): Promise<void> {
  const active = await activePublicApproval(handle.db, doc.documentId)
  if (active === null) return
  const r = await revokeApproval(
    handle.db,
    staff,
    { approvalId: active.id, reason: 'Start from an unapproved document' },
    signal,
    store,
  )
  if (!r.ok) throw new Error(`revoke failed ${r.error}`)
}

async function publicDownloadUrl(): Promise<string | null> {
  const r = await downloadDocument(handle.db, store, null, doc.documentId, 'default', signal)
  return r.ok ? r.value.url : null
}

async function thumbnailEtag(actor: Actor | null): Promise<string | null> {
  const r = await serveDerivative(
    handle.db,
    store,
    actor,
    { documentId: doc.documentId, kind: 'thumbnail', page: 1 },
    signal,
  )
  return r.ok ? r.value.etag : null
}

async function packetFor(): Promise<{ packetId: string; token: string }> {
  const made = await createPacket(
    handle.db,
    staff,
    {
      title: 'Packet',
      board: 'planning_board',
      meetingDate: '2027-04-01' as CivilDate,
      documentIds: [doc.documentId],
    },
    signal,
  )
  if (!made.ok) throw new Error(`packet ${JSON.stringify(made.error)}`)
  const mail = createMemoryTransport()
  const sent = await sendPacketLink(
    handle.db,
    mail,
    staff,
    { packetId: made.value.packetId, recipientName: 'Board', recipientEmail: 'board@example.test' },
    signal,
  )
  if (!sent.ok) throw new Error('link')
  const token = /\/board\/packets\/([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
  return { packetId: made.value.packetId, token }
}

const openVersion = (token: string, versionId: string) =>
  openPacketVersion(handle.db, store, token, versionId, new Date(), signal)

describe('revocation propagation', () => {
  it('revocation stops the stable url, thumbnail, packet item, and search', async () => {
    await revokeActive()
    expect(await publicDownloadUrl()).toBeNull()
    expect(await thumbnailEtag(null)).toBeNull()

    const a = await redactedVersionOf(handle.db, store, staff, doc)
    const approvedA = await approve(a)
    expect(approvedA.ok).toBe(true)
    expect(await publicDownloadUrl()).not.toBeNull()
    expect(await thumbnailEtag(null)).toBe(`"${a}-thumbnail-1"`)
    const packetA = await packetFor()
    expect((await openVersion(packetA.token, a)).ok).toBe(true)
    const keysA = (
      await handle.db.select().from(documentRenditions).where(eq(documentRenditions.versionId, a))
    ).map((r) => r.storageKey)
    expect(keysA.length).toBeGreaterThan(0)

    const b = await redactedVersionOf(handle.db, store, staff, doc)
    await approve(b)
    expect(await thumbnailEtag(null)).toBe(`"${b}-thumbnail-1"`)
    expect(
      await handle.db.select().from(documentRenditions).where(eq(documentRenditions.versionId, a)),
    ).toEqual([])
    for (const key of keysA) {
      expect((await store.head(key, signal)).ok).toBe(false)
    }
    const [itemA] = await handle.db
      .select()
      .from(boardPacketItems)
      .where(eq(boardPacketItems.packetId, packetA.packetId))
    expect(itemA?.withdrawnReason).toBe('revoked')
    expect(itemA?.withdrawnAt).not.toBeNull()
    const packetB = await packetFor()
    expect(await openVersion(packetA.token, a)).toEqual({
      ok: false,
      error: { withdrawnOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    })
    expect((await openVersion(packetB.token, b)).ok).toBe(true)

    await processPreservation(handle.db, store, converter, signal)
    const active = await activePublicApproval(handle.db, doc.documentId)
    await revokeApproval(
      handle.db,
      staff,
      { approvalId: active?.id ?? '', reason: 'The redaction missed an address' },
      signal,
      store,
    )
    expect(await publicDownloadUrl()).toBeNull()
    expect(await thumbnailEtag(null)).toBeNull()
    expect(
      await handle.db.select().from(documentRenditions).where(eq(documentRenditions.versionId, b)),
    ).toEqual([])
    const [itemB] = await handle.db
      .select()
      .from(boardPacketItems)
      .where(and(eq(boardPacketItems.packetId, packetB.packetId)))
    expect(itemB?.withdrawnReason).toBe('revoked')
    expect(await searchPublicDocuments(handle.db, { q: 'Inspection' }, signal)).toEqual([])
    const staffThumb = await thumbnailEtag(staff)
    expect(staffThumb).toBe(`"${doc.versionId}-thumbnail-1"`)
    expect(await openVersion(packetB.token, b)).toEqual({
      ok: false,
      error: { withdrawnOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
    })
  })

  it('derive job twice creates one row per page', async () => {
    const first = await deriveRenditions(handle.db, store, doc.versionId, signal)
    expect(first.ok && first.value.pages).toBe(1)
    await deriveRenditions(handle.db, store, doc.versionId, signal)
    const rows = await handle.db
      .select()
      .from(documentRenditions)
      .where(eq(documentRenditions.versionId, doc.versionId))
    expect(rows.map((r) => `${r.kind}:${r.page}`).sort()).toEqual(['preview:1', 'thumbnail:1'])
    expect(rows.find((r) => r.kind === 'thumbnail')?.width).toBe(240)
    expect(rows.find((r) => r.kind === 'preview')?.width).toBe(1200)
    expect(rows.find((r) => r.kind === 'thumbnail')?.storageKey).toBe(
      `derived/${doc.versionId}/thumbnail-p1.png`,
    )
    const bytes = await store.getStream(`derived/${doc.versionId}/thumbnail-p1.png`, signal)
    expect(bytes.ok).toBe(true)
  })

  it('a privately entitled viewer gets a thumbnail of the original while the public gets the approved copy', async () => {
    const redacted = await redactedVersionOf(handle.db, store, staff, doc)
    await approve(redacted)
    expect(await thumbnailEtag(staff)).toBe(`"${doc.versionId}-thumbnail-1"`)
    expect(await thumbnailEtag(null)).toBe(`"${redacted}-thumbnail-1"`)
  })

  it('an image version gets a thumbnail and a preview of its own', async () => {
    const photo = await uploadRedactionFixture(handle.db, store, staff, 'site-photo.jpg')
    const r = await deriveRenditions(handle.db, store, photo.versionId, signal)
    expect(r.ok && r.value.pages).toBe(1)
    const rows = await handle.db
      .select()
      .from(documentRenditions)
      .where(eq(documentRenditions.versionId, photo.versionId))
    expect(rows).toHaveLength(2)
  })
})
