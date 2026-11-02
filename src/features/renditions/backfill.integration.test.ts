import { readFileSync } from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documents, renditionApprovals } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { ObjectStore } from '@/features/storage/objectStore'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeTestStore } from '@/test/minio'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { uploadRedactionFixture } from '@/test/redactionFixtures'
import { redactedVersionOf } from '@/test/renditionFixtures'

const MIGRATION = new URL('../../../drizzle/0080_m10_rendition_carry_over.sql', import.meta.url)
let handle: TestDb
let store: ObjectStore
let staff: Actor

beforeEach(async () => {
  handle = await makeTestDb()
  store = (await makeTestStore()).store
  await seedParcelWorld(handle.db)
  staff = await staffActor(handle.db, 'staff')
})
afterEach(async () => {
  await handle.drop()
})

async function runBackfill(): Promise<void> {
  const statements = readFileSync(MIGRATION, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.includes('Carried over from Phase 1 publication.'))
  expect(statements).toHaveLength(1)
  await handle.db.execute(sql.raw(statements[0] ?? ''))
}

describe('Phase 1 publication backfill', () => {
  it('backfill approves the latest redacted copy of a public Phase 1 document', async () => {
    const withCopy = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
    const redacted = await redactedVersionOf(handle.db, store, staff, withCopy)
    const plain = await uploadRedactionFixture(handle.db, store, staff, 'site-photo.jpg')
    const hidden = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
    await handle.db
      .update(documents)
      .set({ isPublic: false })
      .where(eq(documents.id, hidden.documentId))
    await handle.db.delete(renditionApprovals)
    await runBackfill()
    const rows = await handle.db.select().from(renditionApprovals)
    const byDoc = new Map(rows.map((r) => [r.documentId, r]))
    expect(byDoc.get(withCopy.documentId)?.versionId).toBe(redacted)
    expect(byDoc.get(plain.documentId)?.versionId).toBe(plain.versionId)
    expect(byDoc.has(hidden.documentId)).toBe(false)
    for (const row of rows) {
      expect(row.approvedByKind).toBe('system')
      expect(row.purpose).toBe('public')
      expect(row.reviewStatement).toBe('Carried over from Phase 1 publication.')
      expect(row.revokedAt).toBeNull()
    }
  })

  it('running the backfill twice leaves one approval per document', async () => {
    const one = await uploadRedactionFixture(handle.db, store, staff, 'letter.pdf')
    await handle.db.delete(renditionApprovals)
    await runBackfill()
    await runBackfill()
    const rows = await handle.db.select().from(renditionApprovals)
    expect(rows.filter((r) => r.documentId === one.documentId)).toHaveLength(1)
  })
})
