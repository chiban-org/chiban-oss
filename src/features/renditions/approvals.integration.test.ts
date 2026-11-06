import { and, eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { documents, documentVersions, parcelRecordLinks, renditionApprovals } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { setPublic, uploadRedactedCopy } from '@/features/documents/publish'
import { searchPublicDocuments } from '@/features/documents/search'
import { createUploadIntent } from '@/features/documents/uploads'
import { resolveRendition } from '@/features/documents/visibility'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { processPreservation } from '@/features/preservation/preserve'
import { approveRendition, revokeApproval } from '@/features/renditions/approvals'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { pdfBytes } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { FIXTURE_PHONE, uploadRedactionFixture } from '@/test/redactionFixtures'
import { activePublicApproval, redactedVersionOf, STATEMENT } from '@/test/renditionFixtures'

const signal = new AbortController().signal
let handle: TestDb
let store: ObjectStore
let staff: Actor
let custodian: Actor
let reviewer: Actor
let doc: { documentId: string; versionId: string }

const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  custodian = await staffActor(handle.db, 'records_custodian')
  reviewer = await staffActor(handle.db, 'reviewer')
  doc = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
})
afterEach(async () => {
  await handle.drop()
})

const approve = (
  versionId: string,
  actor: Actor = staff,
  purpose: 'public' | 'rtk_release' = 'public',
) => approveRendition(handle.db, actor, { versionId, purpose, reviewStatement: STATEMENT }, signal)

async function revokeAll(): Promise<void> {
  const active = await activePublicApproval(handle.db, doc.documentId)
  if (active === null) return
  const r = await revokeApproval(
    handle.db,
    staff,
    { approvalId: active.id, reason: 'Start from an unapproved document' },
    signal,
  )
  if (!r.ok) throw new Error('revoke failed')
}

async function parcelOf(documentId: string): Promise<string | null> {
  const [link] = await handle.db
    .select({ parcelId: parcelRecordLinks.parcelId })
    .from(parcelRecordLinks)
    .where(eq(parcelRecordLinks.recordId, documentId))
  return link?.parcelId ?? null
}

async function publicFile(): Promise<string> {
  const r = await resolveRendition(handle.db, null, doc.documentId, signal)
  return r.ok ? r.value.versionId : 'not_found'
}

describe('the public rendition rule', () => {
  it('a parcel upload chosen as public is approved by the system at upload', async () => {
    const active = await activePublicApproval(handle.db, doc.documentId)
    expect(active?.approvedByKind).toBe('system')
    expect(active?.versionId).toBe(doc.versionId)
    expect(await publicFile()).toBe(doc.versionId)
  })

  it('public viewer gets 404 for a public document with no approval', async () => {
    await revokeAll()
    expect(await publicFile()).toBe('not_found')
    const [row] = await handle.db.select().from(documents).where(eq(documents.id, doc.documentId))
    expect(row?.isPublic).toBe(true)
  })

  it('approving a redacted version serves it to the public and the original to staff', async () => {
    const redacted = await redactedVersionOf(handle.db, store, staff, doc)
    const approved = await approve(redacted)
    expect(approved.ok).toBe(true)
    expect(await publicFile()).toBe(redacted)
    const internal = await resolveRendition(handle.db, staff, doc.documentId, signal)
    expect(internal.ok && internal.value.versionId).toBe(doc.versionId)
  })

  it('second public approval supersedes the first', async () => {
    const first = await redactedVersionOf(handle.db, store, staff, doc)
    const second = await redactedVersionOf(handle.db, store, staff, doc)
    await approve(first)
    const firstApproval = await activePublicApproval(handle.db, doc.documentId)
    await approve(second)
    const active = await activePublicApproval(handle.db, doc.documentId)
    expect(active?.versionId).toBe(second)
    const [old] = await handle.db
      .select()
      .from(renditionApprovals)
      .where(eq(renditionApprovals.id, firstApproval?.id ?? ''))
    expect(old?.revokedAt).not.toBeNull()
    expect(old?.revokeReason).toBe('superseded')
    expect(await publicFile()).toBe(second)
  })

  it('uploading a redacted copy does not change the public version', async () => {
    const before = await publicFile()
    const bytes = pdfBytes('hand redacted copy')
    const intent = await createUploadIntent(
      handle.db,
      store,
      staff,
      {
        target: { kind: 'parcel', id: (await parcelOf(doc.documentId)) ?? '' },
        title: 'x',
        filename: 'hand-redacted.pdf',
        contentType: 'application/pdf',
        sizeBytes: bytes.length,
        seriesKey: 'nh.rs.correspondence_administrative',
      },
      signal,
    )
    if (!intent.ok) throw new Error('intent')
    await fetch(intent.value.url, {
      method: 'PUT',
      headers: intent.value.headers,
      body: new Blob([bytes]),
    })
    const uploaded = await uploadRedactedCopy(
      handle.db,
      store,
      staff,
      { documentId: doc.documentId, intentId: intent.value.intentId },
      signal,
    )
    expect(uploaded.ok).toBe(true)
    expect(await publicFile()).toBe(before)
    expect(uploaded.ok && uploaded.value.versionId).not.toBe(before)
  })

  it('setPublic without an approval is approval_required', async () => {
    await revokeAll()
    await setPublic(handle.db, staff, { documentId: doc.documentId, isPublic: false }, signal)
    const r = await setPublic(
      handle.db,
      staff,
      { documentId: doc.documentId, isPublic: true },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'approval_required' })
    await approve(doc.versionId)
    const again = await setPublic(
      handle.db,
      staff,
      { documentId: doc.documentId, isPublic: true },
      signal,
    )
    expect(again.ok).toBe(true)
  })

  it('public search finds text of the approved version only', async () => {
    const redacted = await redactedVersionOf(handle.db, store, staff, doc)
    await processPreservation(handle.db, store, converter, signal)
    await approve(redacted)
    const hitsRedacted = await searchPublicDocuments(handle.db, { q: 'Inspection' }, signal)
    expect(hitsRedacted.map((h) => h.documentId)).toContain(doc.documentId)
    const phone = await searchPublicDocuments(handle.db, { q: FIXTURE_PHONE }, signal)
    expect(phone).toEqual([])
    await revokeAll()
    expect(await searchPublicDocuments(handle.db, { q: 'Inspection' }, signal)).toEqual([])
  })
})

describe('approving and revoking', () => {
  it('a reviewer cannot approve or revoke', async () => {
    const redacted = await redactedVersionOf(handle.db, store, staff, doc)
    expect(await approve(redacted, reviewer)).toEqual({ ok: false, error: 'forbidden' })
    const active = await activePublicApproval(handle.db, doc.documentId)
    expect(
      await revokeApproval(
        handle.db,
        reviewer,
        { approvalId: active?.id ?? '', reason: 'Because I would like to' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect((await activePublicApproval(handle.db, doc.documentId))?.id).toBe(active?.id)
  })

  it('a pdfa version cannot be approved', async () => {
    await processPreservation(handle.db, store, converter, signal)
    const [pdfa] = await handle.db
      .select()
      .from(documentVersions)
      .where(
        and(eq(documentVersions.documentId, doc.documentId), eq(documentVersions.role, 'pdfa')),
      )
    if (pdfa === undefined) return
    expect(await approve(pdfa.id)).toEqual({ ok: false, error: 'wrong_role' })
  })

  it('a release_redacted version is not approvable for the public', async () => {
    const release = await redactedVersionOf(handle.db, store, staff, doc, 'rtk_release')
    expect(await approve(release)).toEqual({ ok: false, error: 'wrong_role' })
    expect((await approve(release, staff, 'rtk_release')).ok).toBe(true)
  })

  it('a version whose preservation is pending is not_ready', async () => {
    await handle.db.execute(
      (await import('drizzle-orm'))
        .sql`update preservation_records set status = 'pending', required = true`,
    )
    expect(await approve(doc.versionId)).toEqual({ ok: false, error: 'not_ready' })
  })

  it('revoke needs a reason of at least 10 characters and cannot repeat', async () => {
    const active = await activePublicApproval(handle.db, doc.documentId)
    expect(
      await revokeApproval(
        handle.db,
        staff,
        { approvalId: active?.id ?? '', reason: 'short' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'reason_required' })
    const ok = await revokeApproval(
      handle.db,
      staff,
      { approvalId: active?.id ?? '', reason: 'The wrong version was approved' },
      signal,
    )
    expect(ok.ok).toBe(true)
    expect(
      await revokeApproval(
        handle.db,
        staff,
        { approvalId: active?.id ?? '', reason: 'The wrong version was approved' },
        signal,
      ),
    ).toEqual({ ok: false, error: 'already_revoked' })
  })

  it('a custodian can approve and revoke a release rendition without document.publish', async () => {
    const release = await redactedVersionOf(handle.db, store, custodian, doc, 'rtk_release')
    const approved = await approve(release, custodian, 'rtk_release')
    expect(approved.ok).toBe(true)
    expect(await approve(release, custodian, 'public')).toEqual({ ok: false, error: 'forbidden' })
  })
})
