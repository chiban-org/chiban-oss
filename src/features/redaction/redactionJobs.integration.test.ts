import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import {
  documents,
  documentText,
  documentVersions,
  files,
  redactionBoxes,
  redactionJobs,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { requestRedaction } from '@/features/redaction/redactionJobs'
import { runRedactionJob } from '@/features/redaction/runRedactionJob'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import {
  FIXTURE_PHONE,
  LETTER_PHONE_BOX,
  PHOTO_BOX,
  uploadRedactionFixture,
} from '@/test/redactionFixtures'

const signal = new AbortController().signal
const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})
const EXPLANATION = 'The number is a private phone number that invades the owner privacy.'
let handle: TestDb
let store: ObjectStore
let staff: Actor
let reviewer: Actor
let letter: { documentId: string; versionId: string }

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
  reviewer = await staffActor(handle.db, 'reviewer')
  letter = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
})
afterEach(async () => {
  await handle.drop()
})

const pdfBox = (extra: Record<string, unknown> = {}) => ({
  pdf: LETTER_PHONE_BOX,
  exemptionKey: 'nh.rtk.91a5.iv',
  explanation: EXPLANATION,
  ...extra,
})

async function request(
  boxes: Parameters<typeof requestRedaction>[2]['boxes'] = [pdfBox()],
  actor = staff,
) {
  return await requestRedaction(
    handle.db,
    actor,
    {
      documentId: letter.documentId,
      sourceVersionId: letter.versionId,
      purpose: 'public',
      boxes,
    },
    signal,
  )
}

async function queuedJob(): Promise<string> {
  const r = await request()
  if (!r.ok) throw new Error(`request failed ${r.error}`)
  return r.value.jobId
}

async function versionsOf(documentId: string) {
  return await handle.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
}

describe('requesting a redaction', () => {
  it('box without an exemption is unknown_exemption', async () => {
    const r = await request([pdfBox({ exemptionKey: '' })])
    expect(r).toEqual({ ok: false, error: 'unknown_exemption' })
    const missing = await request([{ pdf: LETTER_PHONE_BOX, explanation: EXPLANATION }])
    expect(missing.ok).toBe(false)
  })

  it('a box with a short explanation is explanation_required', async () => {
    const r = await request([pdfBox({ explanation: 'too short' })])
    expect(r).toEqual({ ok: false, error: 'explanation_required' })
  })

  it('no boxes is no_boxes', async () => {
    expect(await request([])).toEqual({ ok: false, error: 'no_boxes' })
  })

  it('reviewer without redaction.create is forbidden', async () => {
    expect(await request([pdfBox()], reviewer)).toEqual({ ok: false, error: 'forbidden' })
    expect(await handle.db.select().from(redactionJobs)).toHaveLength(0)
  })

  it('a source version of another document is not_found', async () => {
    const other = await uploadRedactionFixture(handle.db, store, staff, 'site-photo.jpg')
    const r = await requestRedaction(
      handle.db,
      staff,
      {
        documentId: letter.documentId,
        sourceVersionId: other.versionId,
        purpose: 'public',
        boxes: [pdfBox()],
      },
      signal,
    )
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })

  it('an image box on a pdf is unsupported_type', async () => {
    const r = await request([
      { image: PHOTO_BOX, exemptionKey: 'nh.rtk.91a5.iv', explanation: EXPLANATION },
    ])
    expect(r).toEqual({ ok: false, error: 'unsupported_type' })
  })

  it('stores the job and one cited box per redaction', async () => {
    await request([pdfBox(), pdfBox({ pdf: { ...LETTER_PHONE_BOX, y0: 140, y1: 160 } })])
    const boxes = await handle.db.select().from(redactionBoxes)
    expect(boxes).toHaveLength(2)
    expect(boxes.every((b) => b.exemptionKey === 'nh.rtk.91a5.iv' && b.page === 1)).toBe(true)
  })
})

describe('running a redaction', () => {
  it('completed job adds a public_redacted version and leaves the original bytes and row unchanged', async () => {
    const [originalBefore] = await versionsOf(letter.documentId)
    const [fileBefore] = await handle.db
      .select()
      .from(files)
      .where(eq(files.sha256, originalBefore?.fileSha256 ?? ''))
    const jobId = await queuedJob()
    const ran = await runRedactionJob(handle.db, store, converter, { jobId }, signal)
    expect(ran).toEqual({ ok: true, value: 'complete' })
    const versions = await versionsOf(letter.documentId)
    expect(versions.map((v) => v.role).sort()).toEqual(['original', 'public_redacted'])
    const redacted = versions.find((v) => v.role === 'public_redacted')
    expect(redacted?.derivedFromVersionId).toBe(letter.versionId)
    expect(redacted?.redactionJobId).toBe(jobId)
    expect(redacted?.fileSha256).not.toBe(originalBefore?.fileSha256)
    const [originalAfter] = versions.filter((v) => v.role === 'original')
    expect(originalAfter).toEqual(originalBefore)
    const [fileAfter] = await handle.db
      .select()
      .from(files)
      .where(eq(files.sha256, originalBefore?.fileSha256 ?? ''))
    expect(fileAfter).toEqual(fileBefore)
    const [job] = await handle.db.select().from(redactionJobs)
    expect(job?.status).toBe('complete')
    expect(job?.resultVersionId).toBe(redacted?.id)
  })

  it('redacted version gets a document_text row without the phone', async () => {
    const jobId = await queuedJob()
    await runRedactionJob(handle.db, store, converter, { jobId }, signal)
    const redacted = (await versionsOf(letter.documentId)).find((v) => v.role === 'public_redacted')
    const [text] = await handle.db
      .select()
      .from(documentText)
      .where(eq(documentText.versionId, redacted?.id ?? ''))
    expect(text?.hasTextLayer).toBe(true)
    expect(text?.text).toContain('BP-2027-0001')
    expect(text?.text).not.toContain(FIXTURE_PHONE)
  })

  it('failed verification creates no version', async () => {
    const jobId = await queuedJob()
    const ran = await runRedactionJob(handle.db, store, converter, { jobId }, signal, {
      redactPdf: () =>
        Promise.resolve({
          ok: false,
          error: { reason: 'verification_failed', detail: 'Removed text is still present' },
        }),
    })
    expect(ran).toEqual({ ok: true, value: 'failed' })
    expect(await versionsOf(letter.documentId)).toHaveLength(1)
    const [job] = await handle.db.select().from(redactionJobs)
    expect(job?.status).toBe('failed')
    expect(job?.failureReason).toContain('verification_failed')
    expect(job?.resultVersionId).toBeNull()
  })

  it('a box past the page edge fails the job and creates no version', async () => {
    const r = await request([pdfBox({ pdf: { ...LETTER_PHONE_BOX, x1: 900 } })])
    if (!r.ok) throw new Error('request')
    const ran = await runRedactionJob(handle.db, store, converter, { jobId: r.value.jobId }, signal)
    expect(ran).toEqual({ ok: true, value: 'failed' })
    expect(await versionsOf(letter.documentId)).toHaveLength(1)
  })

  it('running the job twice creates one version', async () => {
    const jobId = await queuedJob()
    await runRedactionJob(handle.db, store, converter, { jobId }, signal)
    const second = await runRedactionJob(handle.db, store, converter, { jobId }, signal)
    expect(second).toEqual({ ok: true, value: 'already_done' })
    expect(await versionsOf(letter.documentId)).toHaveLength(2)
  })

  it('an rtk_release redaction adds a release_redacted version', async () => {
    const r = await requestRedaction(
      handle.db,
      staff,
      {
        documentId: letter.documentId,
        sourceVersionId: letter.versionId,
        purpose: 'rtk_release',
        boxes: [pdfBox()],
      },
      signal,
    )
    if (!r.ok) throw new Error('request')
    await runRedactionJob(handle.db, store, converter, { jobId: r.value.jobId }, signal)
    expect((await versionsOf(letter.documentId)).map((v) => v.role).sort()).toEqual([
      'original',
      'release_redacted',
    ])
  })

  it('a redacted jpeg is a new version and the photo original is untouched', async () => {
    const photo = await uploadRedactionFixture(handle.db, store, staff, 'site-photo.jpg')
    const r = await requestRedaction(
      handle.db,
      staff,
      {
        documentId: photo.documentId,
        sourceVersionId: photo.versionId,
        purpose: 'public',
        boxes: [{ image: PHOTO_BOX, exemptionKey: 'nh.rtk.91a5.iv', explanation: EXPLANATION }],
      },
      signal,
    )
    if (!r.ok) throw new Error('request')
    await runRedactionJob(handle.db, store, converter, { jobId: r.value.jobId }, signal)
    const versions = await versionsOf(photo.documentId)
    const redacted = versions.find((v) => v.role === 'public_redacted')
    expect(redacted?.contentType).toBe('image/jpeg')
    expect(versions.find((v) => v.role === 'original')?.fileSha256).not.toBe(redacted?.fileSha256)
  })

  it('the document row is unchanged by a redaction', async () => {
    const [before] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.id, letter.documentId))
    await runRedactionJob(handle.db, store, converter, { jobId: await queuedJob() }, signal)
    const [after] = await handle.db
      .select()
      .from(documents)
      .where(eq(documents.id, letter.documentId))
    expect(after).toEqual(before)
  })
})
