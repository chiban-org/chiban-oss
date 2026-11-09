import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { migrationItems } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import type { CamaMapping } from '@/features/cama/mapping'
import { storeGeneratedBytes } from '@/features/files/ingest'
import { ingestLocalFile } from '@/features/files/ingestLocal'
import { MIGRATION_ORIGINAL_TYPES } from '@/features/files/sniff'
import {
  type AttachBatch,
  attachMigrated,
  type OcrResult,
} from '@/features/migration/attachMigrated'
import { parseFolder } from '@/features/migration/folderPattern'
import { findDuplicate, findReusableOcr, type MigrationItemRow } from '@/features/migration/lookups'
import type { OcrConverter } from '@/features/migration/ocrmypdf'
import type { ObjectStore } from '@/features/storage/objectStore'

export interface RunContext {
  db: Db
  store: ObjectStore
  converter: OcrConverter
  actor: Actor
  batch: AttachBatch & { sourceRoot: string }
  pattern: RegExp
  parts: CamaMapping['id']['parts']
  signal: AbortSignal
}

const JUNK_NAMES = new Set(['thumbs.db', 'desktop.ini'])
const PDF_TYPE = 'application/pdf'

type ItemPatch = Partial<typeof migrationItems.$inferInsert>

function isJunk(name: string): boolean {
  return name.startsWith('.') || JUNK_NAMES.has(name.toLowerCase())
}

async function settle(ctx: RunContext, item: MigrationItemRow, patch: ItemPatch): Promise<void> {
  await ctx.db.update(migrationItems).set(patch).where(eq(migrationItems.id, item.id))
}

async function obtainOcr(
  ctx: RunContext,
  fullPath: string,
  original: { sha256: string; contentType: string },
): Promise<OcrResult> {
  const reusable = await findReusableOcr(ctx.db, original.sha256)
  if (reusable !== null) return { ok: true, ...reusable }
  const kind = original.contentType === PDF_TYPE ? 'pdf' : 'image'
  const converted = await ctx.converter.ocrToPdfA(fullPath, kind, ctx.signal)
  if (!converted.ok) {
    return { ok: false, reason: converted.error.reason, detail: converted.error.detail }
  }
  const stored = await storeGeneratedBytes(
    ctx.db,
    ctx.store,
    converted.value.pdf,
    PDF_TYPE,
    ctx.signal,
  )
  return {
    ok: true,
    pdfSha256: stored.sha256,
    text: converted.value.text,
    validation: converted.value.validation,
  }
}

export async function importItem(ctx: RunContext, item: MigrationItemRow): Promise<void> {
  ctx.signal.throwIfAborted()
  if (isJunk(path.posix.basename(item.sourcePath))) {
    return await settle(ctx, item, { outcome: 'skipped' })
  }
  const dir = path.posix.dirname(item.sourcePath)
  const folderKey = parseFolder(dir === '.' ? '' : dir, ctx.pattern, ctx.parts)
  if (folderKey === null) {
    return await settle(ctx, item, { outcome: 'excepted', exceptReason: 'unparseable_folder' })
  }
  const duplicate = await findDuplicate(ctx.db, item, folderKey)
  if (duplicate !== null) {
    return await settle(ctx, item, {
      outcome: 'duplicate_linked',
      folderKey,
      duplicateOfItem: duplicate.id,
      documentId: duplicate.documentId,
      parcelLink: duplicate.parcelLink,
    })
  }
  const fullPath = path.join(ctx.batch.sourceRoot, item.sourcePath)
  const stored = await ingestLocalFile(
    ctx.db,
    ctx.store,
    fullPath,
    MIGRATION_ORIGINAL_TYPES,
    ctx.signal,
  )
  if (!stored.ok || stored.value.sha256 !== item.sha256) {
    const unsupported = !stored.ok && stored.error === 'type_not_allowed'
    return await settle(ctx, item, {
      outcome: 'excepted',
      folderKey,
      exceptReason: unsupported ? 'unsupported_type' : 'read_error',
    })
  }
  const original = { sha256: stored.value.sha256, contentType: stored.value.contentType }
  const ocr = await obtainOcr(ctx, fullPath, original)
  await ctx.db.transaction((tx) =>
    attachMigrated(
      tx,
      { actor: ctx.actor, batch: ctx.batch, signal: ctx.signal },
      { item, folderKey, original, ocr },
    ),
  )
}
