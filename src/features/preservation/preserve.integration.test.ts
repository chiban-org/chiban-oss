import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { documentText, documentVersions, preservationRecords } from '@/db/schema'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import {
  listPreservationIncomplete,
  processPreservation,
  retryPreservation,
} from '@/features/preservation/preserve'
import { validatePendingPreservation } from '@/features/preservation/validatePending'
import type { PdfaValidation, PdfaValidator } from '@/features/preservation/verapdf'
import { wrapImageAsPdf } from '@/features/preservation/wrapImage'
import type { ObjectStore } from '@/features/storage/objectStore'
import { runJob } from '@/jobs/defineJob'
import { makeRecordsPreserveJob } from '@/jobs/recordsPreserve'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { uploadAs } from '@/test/documentFixtures'
import { makeTestStore } from '@/test/objectStore'

const signal = new AbortController().signal
const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../test/fixtures/documents/${name}`, import.meta.url))),
  )

let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let appRef: { kind: 'application'; id: string }

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  appRef = { kind: 'application', id: (await makeApplication(handle.db, world)).applicationId }
})
afterAll(async () => {
  await handle.drop()
})

async function recordOf(documentId: string) {
  const [orig] = await handle.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
  const [rec] = await handle.db
    .select()
    .from(preservationRecords)
    .where(eq(preservationRecords.originalVersionId, orig?.id ?? ''))
  return { original: orig, record: rec }
}

const preserve = () => processPreservation(handle.db, store, converter, signal)

const PASSED: PdfaValidation = {
  status: 'passed',
  profile: 'PDF/A-2b',
  validator: 'veraPDF',
  version: '1.30.0',
  detail: null,
}

function fakeValidator(
  answer: (index: number) => PdfaValidation,
): PdfaValidator & { batches: number[] } {
  const batches: number[] = []
  return {
    batches,
    validate: (_input, _signal) => Promise.resolve(answer(0)),
    validateMany: (inputs) => {
      batches.push(inputs.length)
      return Promise.resolve(inputs.map((_, i) => answer(i)))
    },
  }
}

describe('preservation validation record', () => {
  it('validates every unvalidated copy in one batch and stores each result beside its record', async () => {
    const first = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef,
      fixture('text-layer.pdf'),
      {
        title: 'Validated plan',
      },
    )
    const second = await uploadAs(handle.db, store, world.applicant, appRef, fixture('tiny.jpg'), {
      contentType: 'image/jpeg',
      filename: 'validated.jpg',
    })
    await preserve()
    const validator = fakeValidator((i) =>
      i === 0 ? PASSED : { ...PASSED, status: 'failed', detail: 'font' },
    )
    const recorded = await validatePendingPreservation(handle.db, store, validator, signal)
    expect(validator.batches).toHaveLength(1)
    expect(recorded).toBeGreaterThanOrEqual(2)
    const statuses = [
      (await recordOf(first.documentId)).record?.validation,
      (await recordOf(second.documentId)).record?.validation,
    ]
    expect(statuses.every((v) => v !== null)).toBe(true)
    expect(statuses.map((v) => (v as PdfaValidation).status).sort()).toContain('passed')
  })

  it('leaves a copy unvalidated when the validator could not run, so a later sweep retries it', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef,
      fixture('text-layer.pdf'),
      {
        title: 'Retry plan',
        filename: 'retry.pdf',
      },
    )
    await preserve()
    const missing = fakeValidator(() => ({
      status: 'not_validated',
      profile: 'PDF/A-2b',
      validator: null,
      version: null,
      detail: 'veraPDF is not installed or not configured',
    }))
    await validatePendingPreservation(handle.db, store, missing, signal)
    expect((await recordOf(up.documentId)).record?.validation).toBeNull()
    await validatePendingPreservation(
      handle.db,
      store,
      fakeValidator(() => PASSED),
      signal,
    )
    expect((await recordOf(up.documentId)).record?.validation).toEqual(PASSED)
  })

  it('does not stop preservation when a copy fails validation', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef,
      fixture('text-layer.pdf'),
      {
        title: 'Rejected plan',
        filename: 'rejected.pdf',
      },
    )
    await preserve()
    await validatePendingPreservation(
      handle.db,
      store,
      fakeValidator(() => ({ ...PASSED, status: 'failed', detail: 'font' })),
      signal,
    )
    const { record } = await recordOf(up.documentId)
    expect(record?.status).toBe('complete')
    expect(record?.validation).toMatchObject({ status: 'failed' })
  })
})

describe('preservation', () => {
  it('a pdf attachment becomes complete with a pdfa version beside an unchanged original', async () => {
    const bytes = fixture('text-layer.pdf')
    const up = await uploadAs(handle.db, store, world.applicant, appRef, bytes, { title: 'Plan' })
    expect((await recordOf(up.documentId)).record?.status).toBe('pending')
    await preserve()
    const { original, record } = await recordOf(up.documentId)
    expect(record?.status).toBe('complete')
    const versions = await handle.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, up.documentId))
    expect(versions.map((v) => v.role).sort()).toEqual(['original', 'pdfa'])
    const pdfa = versions.find((v) => v.role === 'pdfa')
    expect(pdfa?.id).toBe(record?.pdfaVersionId)
    expect(pdfa?.fileSha256).not.toBe(original?.fileSha256)
    expect(versions.find((v) => v.role === 'original')?.fileSha256).toBe(original?.fileSha256)
    const stored = await store.head(
      `blobs/sha256/${original?.fileSha256.slice(0, 2)}/${original?.fileSha256.slice(2, 4)}/${original?.fileSha256}`,
      signal,
    )
    expect(stored).toMatchObject({ ok: true, value: { size: bytes.length } })
  })

  it('a jpeg upload is wrapped and converted', async () => {
    const up = await uploadAs(handle.db, store, world.applicant, appRef, fixture('tiny.jpg'), {
      contentType: 'image/jpeg',
      filename: 'site.jpg',
    })
    await preserve()
    expect((await recordOf(up.documentId)).record?.status).toBe('complete')
  })

  it('corrupt pdf lands in the preservation incomplete queue', async () => {
    const up = await uploadAs(handle.db, store, world.applicant, appRef, fixture('corrupt.pdf'), {
      title: 'Broken scan',
    })
    await preserve()
    const { record } = await recordOf(up.documentId)
    expect(record?.status).toBe('incomplete')
    expect(record?.reason).toBe('conversion_failed')
    expect(record?.pdfaVersionId).toBeNull()
    const queue = await listPreservationIncomplete(handle.db, world.staff, { limit: 25 }, signal)
    if (!queue.ok) throw new Error('queue')
    expect(queue.value.rows.map((r) => r.documentId)).toContain(up.documentId)
    const versions = await handle.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, up.documentId))
    expect(versions.map((v) => v.role)).toEqual(['original'])
  })

  it('reviewer listing the queue is forbidden', async () => {
    expect(
      await listPreservationIncomplete(handle.db, world.reviewer, { limit: 25 }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
    expect(
      await retryPreservation(handle.db, world.reviewer, { recordId: crypto.randomUUID() }, signal),
    ).toEqual({ ok: false, error: 'forbidden' })
  })

  it('retry after the original is replaced by a valid file completes', async () => {
    const up = await uploadAs(handle.db, store, world.applicant, appRef, fixture('corrupt.pdf'), {
      title: 'Rescan',
    })
    await preserve()
    const { original, record } = await recordOf(up.documentId)
    expect(record?.status).toBe('incomplete')
    const key = `blobs/sha256/${original?.fileSha256.slice(0, 2)}/${original?.fileSha256.slice(2, 4)}/${original?.fileSha256}`
    await store.putBytes(key, fixture('text-layer.pdf'), 'application/pdf', signal)
    const retried = await retryPreservation(
      handle.db,
      world.staff,
      { recordId: record?.id ?? '' },
      signal,
    )
    expect(retried.ok).toBe(true)
    await preserve()
    expect((await recordOf(up.documentId)).record?.status).toBe('complete')
  })

  it('a series with original preservation is not_required and enqueues nothing', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      world.staff,
      { kind: 'parcel', id: world.parcelId },
      fixture('text-layer.pdf'),
      {
        title: 'Letter',
        seriesKey: 'nh.rs.correspondence_administrative',
      },
    )
    const { record } = await recordOf(up.documentId)
    expect(record?.status).toBe('not_required')
    await preserve()
    const versions = await handle.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, up.documentId))
    expect(versions.map((v) => v.role)).toEqual(['original'])
  })

  it('job twice for the same attempt has one effect', async () => {
    const up = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef,
      fixture('text-layer.pdf'),
      { title: 'Twice' },
    )
    const job = makeRecordsPreserveJob({ store, converter })
    const at = '2027-03-02T15:00:30.000Z'
    expect((await runJob(handle.db, job, { at }, signal)).ok).toBe(true)
    expect((await runJob(handle.db, job, { at }, signal)).ok).toBe(true)
    const versions = await handle.db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.documentId, up.documentId))
    expect(versions.filter((v) => v.role === 'pdfa')).toHaveLength(1)
    expect((await recordOf(up.documentId)).record?.attempts).toBe(1)
  })

  it('text layer pdf stores searchable text; an image-only pdf stores has_text_layer false', async () => {
    const text = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef,
      fixture('text-layer.pdf'),
      { title: 'Text' },
    )
    const imageOnly = await wrapImageAsPdf(fixture('tiny.jpg'), 'image/jpeg')
    const image = await uploadAs(
      handle.db,
      store,
      world.applicant,
      appRef,
      new Uint8Array(imageOnly),
      { title: 'Scan' },
    )
    await preserve()
    const textRow = await textOf(text.versionId)
    expect(textRow?.hasTextLayer).toBe(true)
    expect(textRow?.text).toContain('603-555-0142')
    const hits = await handle.db
      .select({ id: documentText.versionId })
      .from(documentText)
      .where(sql`${documentText.tsv} @@ plainto_tsquery('english', 'permit')`)
    expect(hits.map((h) => h.id)).toContain(text.versionId)
    const imageRow = await textOf(image.versionId)
    expect(imageRow?.hasTextLayer).toBe(false)
    expect(imageRow?.text.trim()).toBe('')
  })
})

async function textOf(versionId: string) {
  const [row] = await handle.db
    .select()
    .from(documentText)
    .where(eq(documentText.versionId, versionId))
  return row
}
