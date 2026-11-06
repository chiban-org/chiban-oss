import { copyFile, mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { documentText, documentVersions, preservationRecords } from '@/db/schema'
import type { OcrConverter } from '@/features/migration/ocrmypdf'
import { runBatch } from '@/features/migration/runBatch'
import { scanSource } from '@/features/migration/scanSource'
import { createGhostscriptConverter } from '@/features/preservation/ghostscript'
import { processPreservation, retryPreservation } from '@/features/preservation/preserve'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { FOLDER_PATTERN, importerActor, LOT_14, SERIES_KEY } from '@/test/migrationFixtures'
import { makeTestStore } from '@/test/objectStore'
import { makeParcel, seedParcelWorld } from '@/test/parcels'
import { err, ok } from '@/types/result'

const signal = new AbortController().signal
const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
const gs = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})

let handle: TestDb
let store: ObjectStore

beforeAll(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  await makeParcel(handle.db, [{ format: 'cama15', value: LOT_14 }])
})
afterAll(async () => {
  await handle.drop()
})

const unavailableOcr: OcrConverter = {
  ocrToPdfA: () =>
    Promise.resolve(
      err({ reason: 'missing_dependency' as const, exitCode: null, detail: 'ocrmypdf not found' }),
    ),
}

describe('retrying preservation for a migrated TIFF whose OCR failed', () => {
  it('recovers through the OCR converter once it is available', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tiff-retry-'))
    await mkdir(path.join(root, 'Map 7/Lot 14'), { recursive: true })
    await copyFile(
      here('../../test/fixtures/scanned/alder-pond-scan.tiff'),
      path.join(root, 'Map 7/Lot 14/plan.tiff'),
    )
    const importer = await importerActor(handle.db)
    const scanned = await scanSource(
      handle.db,
      importer,
      {
        root,
        name: 'TIFF only',
        seriesKey: SERIES_KEY,
        folderPattern: FOLDER_PATTERN,
        idFormat: 'cama15',
      },
      signal,
    )
    if (!scanned.ok) throw new Error('scan')
    await runBatch(handle.db, store, unavailableOcr, importer, scanned.value.batchId, signal)
    const [record] = await handle.db.select().from(preservationRecords)
    expect(record?.status).toBe('incomplete')
    expect(record?.reason).toBe('ocr_missing_dependency')

    const retried = await retryPreservation(
      handle.db,
      importer,
      { recordId: record?.id ?? '' },
      signal,
    )
    expect(retried.ok).toBe(true)

    const pdf = new Uint8Array(await readFile(here('../../test/fixtures/documents/text-layer.pdf')))
    const restoredOcr: OcrConverter = {
      ocrToPdfA: async (inputPath, kind) => {
        const input = await readFile(inputPath)
        expect(kind).toBe('image')
        expect(input.subarray(0, 2).toString('latin1')).toMatch(/II|MM/)
        return ok({ pdf, text: 'Recovered scan text' })
      },
    }
    await processPreservation(handle.db, store, gs, signal, undefined, restoredOcr)

    const [after] = await handle.db
      .select()
      .from(preservationRecords)
      .where(eq(preservationRecords.id, record?.id ?? ''))
    expect(after?.status).toBe('complete')
    expect(after?.pdfaVersionId).not.toBeNull()
    const [text] = await handle.db
      .select()
      .from(documentText)
      .where(eq(documentText.versionId, after?.pdfaVersionId ?? ''))
    expect(text?.text).toBe('Recovered scan text')
    const roles = await handle.db.select({ role: documentVersions.role }).from(documentVersions)
    expect(roles.map((r) => r.role).sort()).toEqual(['original', 'pdfa'])
  })
})
