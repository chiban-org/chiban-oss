import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  documents,
  documentText,
  files,
  migrationBatches,
  migrationItems,
  preservationRecords,
} from '@/db/schema'
import { runBatch } from '@/features/migration/runBatch'
import { listUnresolvedLinks } from '@/features/parcels/unresolvedList'
import { makeTestDb, type TestDb } from '@/test/db'
import { UNKNOWN_LOT } from '@/test/migrationFixtures'
import {
  buildMigrationWorld,
  itemAt,
  type MigrationWorld,
  signal,
  tableCounts,
  versionsOf,
  WORLD_TIMEOUT_MS,
} from '@/test/migrationWorld'

let handle: TestDb
let world: MigrationWorld

beforeAll(async () => {
  handle = await makeTestDb()
  world = await buildMigrationWorld(handle)
}, WORLD_TIMEOUT_MS)

afterAll(async () => {
  await handle.drop()
})

describe('legacy migration run', () => {
  it('report reconciles source to imported, linked, excepted, and skipped', async () => {
    const [batch] = await world.db
      .select()
      .from(migrationBatches)
      .where(eq(migrationBatches.id, world.batchId))
    expect(batch?.status).toBe('staged')
    const expected = {
      source: 9,
      imported: 5,
      duplicateLinked: 1,
      excepted: 2,
      skipped: 1,
      ocrFailed: 1,
      unresolvedParcel: 1,
      exceptionsByReason: { unparseable_folder: 1, unsupported_type: 1 },
    }
    expect(batch?.report).toEqual(expected)
    expect(expected.source).toBe(
      expected.imported + expected.duplicateLinked + expected.excepted + expected.skipped,
    )
    const items = await world.db
      .select()
      .from(migrationItems)
      .where(eq(migrationItems.batchId, world.batchId))
    expect(items).toHaveLength(9)
    expect(items.every((i) => i.outcome !== null)).toBe(true)
  })

  it('the original bytes are unchanged after OCR', async () => {
    const item = await itemAt(world, 'Map 7/Lot 14/plan.tiff')
    const original = (await versionsOf(world, item.documentId)).find((v) => v.role === 'original')
    const [stored] = await world.db
      .select()
      .from(files)
      .where(eq(files.sha256, original?.fileSha256 ?? ''))
    const fetched = await world.store.getStream(stored?.storageKey ?? '', signal)
    if (!fetched.ok) throw new Error('stored original missing')
    const bytes = Buffer.from(await new Response(fetched.value).arrayBuffer())
    const source = await readFile(path.join(world.root, item.sourcePath))
    expect(bytes.equals(source)).toBe(true)
    expect(stored?.sha256).toBe(item.sha256)
    expect(original?.contentType).toBe('image/tiff')
  })

  it('a duplicate in one folder is linked, not stored twice', async () => {
    const a = await itemAt(world, 'Map 7/Lot 14/scan-copy.pdf')
    const b = await itemAt(world, 'Map 7/Lot 14/scan.pdf')
    const imported = a.outcome === 'imported' ? a : b
    const linked = a.outcome === 'imported' ? b : a
    expect(imported.outcome).toBe('imported')
    expect(linked.outcome).toBe('duplicate_linked')
    expect(linked.duplicateOfItem).toBe(imported.id)
    expect(linked.documentId).toBe(imported.documentId)
    const onParcel = await world.db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.recordKind, 'parcel'), eq(documents.recordId, world.parcel14)))
    const withFile = (await Promise.all(onParcel.map((d) => versionsOf(world, d.id)))).filter(
      (versions) => versions.some((v) => v.fileSha256 === a.sha256),
    )
    expect(withFile).toHaveLength(1)
  })

  it('the same file in two parcel folders is one files row and two documents', async () => {
    const lot14 = await itemAt(world, 'Map 7/Lot 14/scan.pdf')
    const lot15 = await itemAt(world, 'Map 7/Lot 15/scan.pdf')
    expect(lot15.outcome).toBe('imported')
    expect(lot14.sha256).toBe(lot15.sha256)
    expect(await world.db.select().from(files).where(eq(files.sha256, lot15.sha256))).toHaveLength(
      1,
    )
    const docs = await world.db
      .select({ recordId: documents.recordId })
      .from(documents)
      .where(eq(documents.migrationBatchId, world.batchId))
    const onLot15 = docs.filter((d) => d.recordId === world.parcel15)
    const onLot14 = docs.filter((d) => d.recordId === world.parcel14)
    expect(onLot15.length).toBeGreaterThanOrEqual(1)
    expect(onLot14.length).toBeGreaterThanOrEqual(1)
    const lot14Doc = (
      await versionsOf(world, (await docIdOn(world.parcel14, lot15.sha256)) ?? null)
    )[0]
    expect(lot14Doc?.fileSha256).toBe(lot15.sha256)
  })

  it('an unknown parcel id lands in the unresolved queue', async () => {
    const item = await itemAt(world, 'Map 9/Lot 99/deed.pdf')
    expect(item.outcome).toBe('imported')
    expect(item.parcelLink).toBe('unresolved')
    const queue = await listUnresolvedLinks(world.db, signal)
    const link = queue.find((l) => l.recordId === item.documentId)
    expect(link?.recordKind).toBe('document')
    expect(link?.rawRefValue).toBe(UNKNOWN_LOT)
    expect(link?.rawRefFormat).toBe('cama15')
  })

  it('an ocr failure leaves the original and marks preservation incomplete', async () => {
    const item = await itemAt(world, 'Map 7/Lot 15/locked.pdf')
    expect(item.outcome).toBe('imported')
    expect(item.ocrStatus).toBe('failed')
    expect(item.ocrReason).toBe('encrypted')
    const versions = await versionsOf(world, item.documentId)
    expect(versions.map((v) => v.role)).toEqual(['original'])
    const [record] = await world.db
      .select()
      .from(preservationRecords)
      .where(eq(preservationRecords.originalVersionId, versions[0]?.id ?? ''))
    expect(record?.status).toBe('incomplete')
    expect(record?.pdfaVersionId).toBeNull()
  })

  it('a successful ocr stores a pdfa version with a complete record and a text layer', async () => {
    const item = await itemAt(world, 'Map 7/Lot 14/plan.tiff')
    expect(item.ocrStatus).toBe('complete')
    const versions = await versionsOf(world, item.documentId)
    const original = versions.find((v) => v.role === 'original')
    const pdfa = versions.find((v) => v.role === 'pdfa')
    expect(pdfa?.contentType).toBe('application/pdf')
    const [record] = await world.db
      .select()
      .from(preservationRecords)
      .where(eq(preservationRecords.originalVersionId, original?.id ?? ''))
    expect(record?.status).toBe('complete')
    expect(record?.pdfaVersionId).toBe(pdfa?.id)
    const [text] = await world.db
      .select()
      .from(documentText)
      .where(eq(documentText.versionId, pdfa?.id ?? ''))
    expect(text?.hasTextLayer).toBe(true)
    expect(text?.text).toContain('ALDER POND')
  })

  it('a file seen under a second parcel reuses the first ocr output', () => {
    const MAX_OCR_RUNS = 4
    expect(world.ocrCalls()).toBeLessThanOrEqual(MAX_OCR_RUNS)
  })

  it('rerunning a batch changes nothing', async () => {
    const before = await tableCounts(world.db)
    const itemsBefore = await world.db
      .select()
      .from(migrationItems)
      .where(eq(migrationItems.batchId, world.batchId))
    const calls = world.ocrCalls()
    const again = await runBatch(
      world.db,
      world.store,
      world.converter,
      world.importer,
      world.batchId,
      signal,
    )
    expect(again.ok && again.value.source).toBe(9)
    expect(await tableCounts(world.db)).toEqual(before)
    expect(world.ocrCalls()).toBe(calls)
    const itemsAfter = await world.db
      .select()
      .from(migrationItems)
      .where(eq(migrationItems.batchId, world.batchId))
    expect(itemsAfter).toEqual(itemsBefore)
  })
})

async function docIdOn(parcelId: string, sha256: string): Promise<string | undefined> {
  const rows = await world.db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.recordKind, 'parcel'), eq(documents.recordId, parcelId)))
  for (const row of rows) {
    if ((await versionsOf(world, row.id)).some((v) => v.fileSha256 === sha256)) return row.id
  }
  return undefined
}
