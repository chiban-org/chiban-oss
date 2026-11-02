import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { documents, documentVersions, migrationBatches } from '@/db/schema'
import { searchDocuments, searchPublicDocuments } from '@/features/documents/search'
import { resolveRendition } from '@/features/documents/visibility'
import { publishMigrationBatch } from '@/features/migration/publishBatch'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  buildMigrationWorld,
  itemAt,
  type MigrationWorld,
  signal,
  versionsOf,
  WORLD_TIMEOUT_MS,
} from '@/test/migrationWorld'

let handle: TestDb
let world: MigrationWorld
let hitsBeforePublish: string[] = []
let staffHitsBeforePublish: string[] = []

const batchDocuments = () =>
  world.db.select().from(documents).where(eq(documents.migrationBatchId, world.batchId))

beforeAll(async () => {
  handle = await makeTestDb()
  world = await buildMigrationWorld(handle)
  staffHitsBeforePublish = (
    await searchDocuments(world.db, world.publisher, { q: 'ALDER POND' }, signal)
  ).rows.map((r) => r.documentId)
  hitsBeforePublish = (await searchPublicDocuments(world.db, { q: 'ALDER POND' }, signal)).map(
    (h) => h.documentId,
  )
}, WORLD_TIMEOUT_MS)

afterAll(async () => {
  await handle.drop()
})

describe('publication', () => {
  it('nothing is public before publish; publish makes resolved parcel files public', async () => {
    const before = await batchDocuments()
    expect(before).toHaveLength(5)
    expect(before.every((d) => !d.isPublic && d.docKind === 'parcel_file')).toBe(true)

    expect(await publishMigrationBatch(world.db, world.importer, world.batchId, signal)).toEqual({
      ok: false,
      error: 'forbidden',
    })
    expect((await batchDocuments()).some((d) => d.isPublic)).toBe(false)

    expect(await publishMigrationBatch(world.db, world.publisher, world.batchId, signal)).toEqual({
      ok: true,
      value: { published: 4 },
    })
    const unresolved = await itemAt(world, 'Map 9/Lot 99/deed.pdf')
    const after = await batchDocuments()
    expect(after.filter((d) => d.isPublic)).toHaveLength(4)
    expect(after.find((d) => d.id === unresolved.documentId)?.isPublic).toBe(false)
    const [batch] = await world.db
      .select()
      .from(migrationBatches)
      .where(eq(migrationBatches.id, world.batchId))
    expect(batch?.status).toBe('published')
  })

  it('publishing a batch that is not staged is refused', async () => {
    expect(await publishMigrationBatch(world.db, world.publisher, world.batchId, signal)).toEqual({
      ok: false,
      error: 'not_staged',
    })
  })

  it('public search finds OCR text only after publish', async () => {
    expect(hitsBeforePublish).toEqual([])
    const hits = (await searchPublicDocuments(world.db, { q: 'ALDER POND' }, signal)).map(
      (h) => h.documentId,
    )
    const unresolved = await itemAt(world, 'Map 9/Lot 99/deed.pdf')
    expect(hits.length).toBeGreaterThanOrEqual(3)
    expect(hits).not.toContain(unresolved.documentId)
    const published = (await batchDocuments()).filter((d) => d.isPublic).map((d) => d.id)
    expect(hits.every((id) => published.includes(id))).toBe(true)
  })

  it('staff search finds OCR text in a batch before it is published', async () => {
    const tiff = await itemAt(world, 'Map 7/Lot 14/plan.tiff')
    expect(staffHitsBeforePublish).toContain(tiff.documentId)
  })

  it('a migrated tiff downloads as its pdfa rendition by default', async () => {
    const item = await itemAt(world, 'Map 7/Lot 14/plan.tiff')
    const asStaff = await resolveRendition(world.db, world.publisher, item.documentId ?? '', signal)
    expect(asStaff.ok && asStaff.value.role).toBe('pdfa')
    expect(asStaff.ok && asStaff.value.contentType).toBe('application/pdf')
    const asPublic = await resolveRendition(world.db, null, item.documentId ?? '', signal)
    expect(asPublic.ok && asPublic.value.role).toBe('pdfa')
  })

  it('an image-only scanned pdf downloads as its pdfa rendition by default', async () => {
    const item = await itemAt(world, 'Map 7/Lot 15/scan.pdf')
    const asStaff = await resolveRendition(world.db, world.publisher, item.documentId ?? '', signal)
    expect(asStaff.ok && asStaff.value.role).toBe('pdfa')
  })

  it('a document whose ocr failed still downloads as its original', async () => {
    const item = await itemAt(world, 'Map 7/Lot 15/locked.pdf')
    const asStaff = await resolveRendition(world.db, world.publisher, item.documentId ?? '', signal)
    expect(asStaff.ok && asStaff.value.role).toBe('original')
  })

  it('a public_redacted version still takes precedence for public viewers', async () => {
    const item = await itemAt(world, 'Map 7/Lot 14/plan.tiff')
    const pdfa = (await versionsOf(world, item.documentId)).find((v) => v.role === 'pdfa')
    await world.db.insert(documentVersions).values({
      documentId: item.documentId ?? '',
      role: 'public_redacted',
      fileSha256: pdfa?.fileSha256 ?? '',
      filename: 'redacted.pdf',
      contentType: 'application/pdf',
    })
    const asPublic = await resolveRendition(world.db, null, item.documentId ?? '', signal)
    expect(asPublic.ok && asPublic.value.role).toBe('public_redacted')
    const asStaff = await resolveRendition(world.db, world.publisher, item.documentId ?? '', signal)
    expect(asStaff.ok && asStaff.value.role).toBe('pdfa')
  })
})
