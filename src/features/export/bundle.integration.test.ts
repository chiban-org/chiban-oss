import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { sql } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { PDFDocument } from 'pdf-lib'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { env } from '@/config/env'
import { EXPORT_ENTITIES } from '@/features/export/entities'
import { importArchive } from '@/features/export/importArchive'
import type { ExportManifest } from '@/features/export/manifest'
import { entityColumns } from '@/features/export/tabular/columns'
import { writeArchive } from '@/features/export/writeArchive'
import { createGhostscriptConverter, type PdfaConverter } from '@/features/preservation/ghostscript'
import { processPreservation } from '@/features/preservation/preserve'
import { validatePendingPreservation } from '@/features/preservation/validatePending'
import {
  createVeraPdfValidator,
  type PdfaValidation,
  type PdfaValidator,
} from '@/features/preservation/verapdf'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { uploadAs } from '@/test/documentFixtures'
import { memoryArchive } from '@/test/memoryArchive'
import { makeTestStore } from '@/test/objectStore'
import { collectEntries, freshTarget, rebuildZip, sourceOf } from '@/test/roundTrip'

const signal = new AbortController().signal
const converter = createGhostscriptConverter({
  gsPath: env.GHOSTSCRIPT_PATH,
  iccProfilePath: env.GHOSTSCRIPT_ICC_PROFILE ?? null,
  timeoutMs: 120_000,
})
const PASSED: PdfaValidation = {
  status: 'passed',
  profile: 'PDF/A-2b',
  validator: 'veraPDF',
  version: '1.30.0',
  detail: null,
}
const FAILED: PdfaValidation = { ...PASSED, status: 'failed', detail: '6.2.11.4.1: font' }
const validatedAs = (validation: PdfaValidation): PdfaValidator => ({
  validate: () => Promise.resolve(validation),
  validateMany: (inputs) => Promise.resolve(inputs.map(() => validation)),
})
const verapdfInstalled = (() => {
  try {
    execFileSync(env.VERAPDF_PATH, ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const failingConverter: PdfaConverter = {
  toPdfA: () =>
    Promise.resolve({
      ok: false,
      error: { reason: 'conversion_failed', detail: 'forced failure' },
    }),
  extractText: () => Promise.resolve({ ok: true, value: '' }),
}
const fixture = (name: string) =>
  new Uint8Array(
    readFileSync(fileURLToPath(new URL(`../../test/fixtures/documents/${name}`, import.meta.url))),
  )
async function secondPdf(): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create()
  doc.addPage().drawText('Second plan for the export test')
  return new Uint8Array(await doc.save())
}
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

let handle: TestDb
let world: PermitWorld
let store: ObjectStore
let preservedSha: string
let plainSha: string

beforeAll(async () => {
  handle = await makeTestDb()
  world = await setupPermitWorld(handle.db)
  store = (await makeTestStore()).store
  const ref = {
    kind: 'application' as const,
    id: (await makeApplication(handle.db, world)).applicationId,
  }
  const preserved = fixture('text-layer.pdf')
  preservedSha = sha(preserved)
  await uploadAs(handle.db, store, world.applicant, ref, preserved, { title: 'Preserved plan' })
  await processPreservation(handle.db, store, converter, signal)
  await validatePendingPreservation(handle.db, store, validatedAs(PASSED), signal)
  const plain = await secondPdf()
  plainSha = sha(plain)
  await uploadAs(handle.db, store, world.applicant, ref, plain, { title: 'Second plan' })
}, 240_000)
afterAll(async () => {
  await handle.drop()
})

async function build(conv: PdfaConverter, maxSheetRows?: number, validator?: PdfaValidator) {
  const out = memoryArchive()
  const manifest = await writeArchive(
    handle.db,
    store,
    {
      exportId: crypto.randomUUID(),
      kind: 'business',
      base: null,
      bundle: {
        converter: conv,
        ...(validator === undefined ? {} : { validator }),
        ...(maxSheetRows === undefined ? {} : { maxSheetRows }),
      },
    },
    out.sink,
    signal,
  )
  return { manifest, entries: out.entries, order: out.order }
}

function entityRows(entries: Map<string, Buffer>, manifest: ExportManifest, name: string) {
  const entity = manifest.entities.find((e) => e.name === name)
  const text = entries.get(entity?.path ?? '')?.toString('utf8') ?? ''
  return text
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
}

function expectSameShape(
  name: string,
  header: string[],
  ndjson: Record<string, unknown>[],
  records: Record<string, string>[],
): void {
  for (const row of ndjson) {
    for (const key of Object.keys(row)) expect(header, `${name}.${key}`).toContain(key)
  }
  const first = new Map(Object.entries(ndjson[0] ?? {}))
  const firstCsv = new Map(Object.entries(records[0] ?? {}))
  if (first.size === 0) return
  expect([...firstCsv.keys()]).toEqual(header)
  const key = header.find((c) => {
    const v = first.get(c)
    return typeof v === 'string' && !/^[=+\-@\t\r]/.test(v)
  })
  if (key !== undefined) expect(firstCsv.get(key)).toBe(first.get(key))
}

describe('export bundle: tables', () => {
  it('writes one BOM-prefixed CSV per entity whose header and rows match the NDJSON', async () => {
    const { manifest, entries } = await build(converter)
    expect(manifest.tables?.csv).toHaveLength(EXPORT_ENTITIES.length)
    for (const entity of EXPORT_ENTITIES) {
      const item = manifest.tables?.csv.find((c) => c.entity === entity.name)
      const bytes = entries.get(item?.path ?? '')
      expect(bytes, entity.name).toBeDefined()
      expect(sha(bytes ?? Buffer.alloc(0))).toBe(item?.sha256)
      expect([...(bytes ?? Buffer.alloc(0)).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      const records = parse((bytes ?? Buffer.alloc(0)).toString('utf8'), {
        bom: true,
        columns: true,
        skip_empty_lines: true,
      }) as Record<string, string>[]
      const ndjson = entityRows(entries, manifest, entity.name)
      expect(records, entity.name).toHaveLength(ndjson.length)
      expectSameShape(entity.name, entityColumns(entity), ndjson, records)
    }
  }, 240_000)

  it('writes one workbook with a sheet per entity and records it in the manifest', async () => {
    const { manifest, entries } = await build(converter)
    const bytes = entries.get(manifest.tables?.workbook.path ?? '')
    expect(sha(bytes ?? Buffer.alloc(0))).toBe(manifest.tables?.workbook.sha256)
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes as never)
    const names = book.worksheets.map((w) => w.name)
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length)
    for (const name of names) expect(name.length).toBeLessThanOrEqual(31)
    for (const entity of EXPORT_ENTITIES) {
      const sheets = manifest.tables?.workbook.sheets.filter((s) => s.entity === entity.name) ?? []
      expect(sheets.length, entity.name).toBeGreaterThan(0)
      const count = manifest.entities.find((e) => e.name === entity.name)?.count
      expect(sheets.reduce((n, s) => n + s.rows, 0)).toBe(count)
    }
  }, 240_000)

  it('splits an entity across sheets when it exceeds the sheet row limit', async () => {
    const { manifest } = await build(converter, 3)
    const users = manifest.tables?.workbook.sheets.filter((s) => s.entity === 'users') ?? []
    const total = manifest.entities.find((e) => e.name === 'users')?.count ?? 0
    expect(total).toBeGreaterThan(2)
    expect(users.length).toBeGreaterThan(1)
    expect(users.every((s) => s.rows <= 2)).toBe(true)
    expect(users.reduce((n, s) => n + s.rows, 0)).toBe(total)
  }, 240_000)
})

describe('export bundle: PDF/A copies', () => {
  it('every entry that is not failed points at a file in the archive', async () => {
    const { manifest, entries } = await build(converter)
    const present = (manifest.pdfa ?? [])
      .filter((p) => p.status !== 'failed')
      .map((p) => entries.has(p.path ?? ''))
    expect(present.length).toBeGreaterThan(0)
    expect(present.every(Boolean)).toBe(true)
  }, 240_000)

  it('reuses the stored PDF/A copy and converts the others, keeping originals', async () => {
    const { manifest, entries } = await build(converter)
    const preserved = manifest.pdfa?.find((p) => p.sourceSha256 === preservedSha)
    expect(preserved?.status).toBe('stored')
    expect(entries.has(preserved?.path ?? '')).toBe(true)
    expect(preserved?.path?.startsWith('files/')).toBe(true)
    const plain = manifest.pdfa?.find((p) => p.sourceSha256 === plainSha)
    expect(plain?.status).toBe('converted')
    const converted = entries.get(plain?.path ?? '')
    expect(sha(converted ?? Buffer.alloc(0))).toBe(plain?.sha256)
    expect(converted?.toString('latin1')).toMatch(/pdfaid:part(?:>|=["'])2/)
    expect(manifest.files.some((f) => f.sha256 === plainSha)).toBe(true)
  }, 240_000)

  it('lists the validation recorded when the stored copy was made', async () => {
    const { manifest } = await build(converter, undefined, validatedAs(FAILED))
    expect(manifest.pdfa?.find((p) => p.sourceSha256 === preservedSha)?.validation).toEqual(PASSED)
  }, 240_000)

  it('validates a copy the export converts and records a fail without dropping the copy', async () => {
    const { manifest, entries } = await build(converter, undefined, validatedAs(FAILED))
    const plain = manifest.pdfa?.find((p) => p.sourceSha256 === plainSha)
    expect(plain).toMatchObject({ status: 'converted', validation: FAILED })
    expect(entries.has(plain?.path ?? '')).toBe(true)
  }, 240_000)

  it('says not validated, never passed, when the export has no validator', async () => {
    const { manifest } = await build(converter)
    expect(manifest.pdfa?.find((p) => p.sourceSha256 === plainSha)?.validation).toEqual({
      status: 'not_validated',
      profile: 'PDF/A-2b',
      validator: null,
      version: null,
      detail: 'No validator was configured for this export',
    })
  }, 240_000)

  it('says not validated for a stored copy that was made before anything was recorded', async () => {
    await handle.db.execute(sql`update preservation_records set validation = null`)
    try {
      const { manifest } = await build(converter, undefined, validatedAs(PASSED))
      expect(manifest.pdfa?.find((p) => p.sourceSha256 === preservedSha)?.validation).toMatchObject(
        {
          status: 'not_validated',
          detail: 'No validation was recorded when this copy was made',
        },
      )
    } finally {
      await handle.db.execute(
        sql`update preservation_records set validation = ${JSON.stringify(PASSED)}::jsonb where status = 'complete'`,
      )
    }
  }, 240_000)

  it.skipIf(!verapdfInstalled)(
    'validates the copy it converts with the real veraPDF as PDF/A-2b',
    async () => {
      const real = createVeraPdfValidator({ path: env.VERAPDF_PATH, timeoutMs: 120_000 })
      const { manifest } = await build(converter, undefined, real)
      expect(manifest.pdfa?.find((p) => p.sourceSha256 === plainSha)?.validation).toMatchObject({
        status: 'passed',
        profile: 'PDF/A-2b',
        validator: 'veraPDF',
      })
    },
    240_000,
  )

  it('records a failed conversion and still completes the export', async () => {
    const { manifest, entries } = await build(failingConverter)
    const plain = manifest.pdfa?.find((p) => p.sourceSha256 === plainSha)
    expect(plain).toMatchObject({
      status: 'failed',
      path: null,
      reason: 'conversion_failed',
      detail: 'forced failure',
    })
    expect(manifest.pdfa?.find((p) => p.sourceSha256 === preservedSha)?.status).toBe('stored')
    expect(entries.has('manifest.json')).toBe(true)
  }, 240_000)
})

describe('export bundle: import', () => {
  it('an archive with tables and PDF/A copies still imports', async () => {
    const { manifest, entries } = await build(converter)
    const target = await freshTarget()
    try {
      const zip = await rebuildZip(entries)
      const result = await importArchive(target.target.db, target.store, sourceOf(zip), signal)
      expect(result.ok, JSON.stringify(result)).toBe(true)
      expect((await collectEntries(zip)).has(manifest.tables?.workbook.path ?? '')).toBe(true)
    } finally {
      await target.target.drop()
    }
  }, 240_000)

  it('incremental archives carry no tables or PDF/A copies', async () => {
    const out = memoryArchive()
    const manifest = await writeArchive(
      handle.db,
      store,
      { exportId: crypto.randomUUID(), kind: 'incremental', base: null },
      out.sink,
      signal,
    )
    expect(manifest.tables).toBeUndefined()
    expect(manifest.pdfa).toBeUndefined()
    expect(
      [...out.entries.keys()].some((p) => p.startsWith('tables/') || p.startsWith('pdfa/')),
    ).toBe(false)
  }, 240_000)
})
