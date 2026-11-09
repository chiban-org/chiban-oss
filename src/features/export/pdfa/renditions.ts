import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import type { PdfaRenditionEntry } from '@/features/export/manifest'
import { filePath, pdfaPath } from '@/features/export/manifest'
import type { PdfaConverter } from '@/features/preservation/ghostscript'
import {
  notValidated,
  type PdfaValidation,
  pdfaValidationSchema,
} from '@/features/preservation/verapdf'
import type { ObjectStore } from '@/features/storage/objectStore'

const PDF_TYPE = 'application/pdf'
const DETAIL_LIMIT = 500

export interface PdfFile {
  sha256: string
  size: number
  contentType: string
  storageKey: string
}

export interface PdfaSnapshot {
  pdfaBlobs: Set<string>
  stored: Map<string, string>
  validations: Map<string, PdfaValidation>
}

const NOT_RECORDED = 'No validation was recorded when this copy was made'
const NO_VALIDATOR = 'No validator was configured for this export'

export function pdfaWorkName(sourceSha: string): string {
  return `pdfa-${sourceSha}.pdf`
}

export async function readPdfaSnapshot(tx: Tx): Promise<PdfaSnapshot> {
  const blobs = await tx.execute<{ sha: string }>(
    sql`select distinct file_sha256 as sha from document_versions where role = 'pdfa'`,
  )
  const stored = await tx.execute<{ source: string; pdfa: string }>(sql`
    select o.file_sha256 as source, a.file_sha256 as pdfa
    from preservation_records r
    join document_versions o on o.id = r.original_version_id
    join document_versions a on a.id = r.pdfa_version_id
    where r.status = 'complete'
    order by o.file_sha256, a.file_sha256`)
  const validated = await tx.execute<{ pdfa: string; validation: unknown }>(sql`
    select a.file_sha256 as pdfa, r.validation
    from preservation_records r
    join document_versions a on a.id = r.pdfa_version_id
    where r.status = 'complete' and r.validation is not null
    order by a.file_sha256, r.id`)
  const validations = new Map<string, PdfaValidation>()
  for (const row of validated.rows) {
    const parsed = pdfaValidationSchema.safeParse(row.validation)
    if (parsed.success && !validations.has(row.pdfa)) validations.set(row.pdfa, parsed.data)
  }
  return {
    pdfaBlobs: new Set(blobs.rows.map((r) => r.sha)),
    stored: new Map(stored.rows.map((r) => [r.source, r.pdfa])),
    validations,
  }
}

async function readBytes(
  store: ObjectStore,
  key: string,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  const stream = await store.getStream(key, signal)
  if (!stream.ok) return null
  return new Uint8Array(await new Response(stream.value).arrayBuffer())
}

function failed(sourceSha256: string, reason: string, detail: string | null): PdfaRenditionEntry {
  return {
    sourceSha256,
    status: 'failed',
    path: null,
    sha256: null,
    size: null,
    reason,
    detail: detail === null ? null : detail.slice(0, DETAIL_LIMIT),
  }
}

export interface RenditionContext {
  files: PdfFile[]
  snapshot: PdfaSnapshot
  workDir: string
  store: ObjectStore
  converter: PdfaConverter
  signal: AbortSignal
}

async function convert(ctx: RenditionContext, file: PdfFile): Promise<PdfaRenditionEntry> {
  const bytes = await readBytes(ctx.store, file.storageKey, ctx.signal)
  if (bytes === null) return failed(file.sha256, 'missing_file', 'The stored file is missing')
  const converted = await ctx.converter.toPdfA(bytes, ctx.signal)
  if (!converted.ok) return failed(file.sha256, converted.error.reason, converted.error.detail)
  await writeFile(join(ctx.workDir, pdfaWorkName(file.sha256)), converted.value)
  const validation =
    (await ctx.converter.validatePdfA?.(converted.value, ctx.signal)) ?? notValidated(NO_VALIDATOR)
  return {
    sourceSha256: file.sha256,
    status: 'converted',
    path: pdfaPath(file.sha256),
    sha256: createHash('sha256').update(converted.value).digest('hex'),
    size: converted.value.length,
    reason: null,
    detail: null,
    validation,
  }
}

export async function buildPdfaRenditions(ctx: RenditionContext): Promise<PdfaRenditionEntry[]> {
  const bySha = new Map(ctx.files.map((f) => [f.sha256, f]))
  const entries: PdfaRenditionEntry[] = []
  for (const file of ctx.files) {
    ctx.signal.throwIfAborted()
    if (file.contentType !== PDF_TYPE) continue
    const storedSha = ctx.snapshot.stored.get(file.sha256)
    const own = ctx.snapshot.pdfaBlobs.has(file.sha256)
    const reuseSha = own ? file.sha256 : storedSha
    const reuse = reuseSha === undefined ? undefined : bySha.get(reuseSha)
    if (reuse !== undefined) {
      entries.push({
        sourceSha256: file.sha256,
        status: 'stored',
        path: filePath(reuse.sha256),
        sha256: reuse.sha256,
        size: reuse.size,
        reason: null,
        detail: null,
        validation: ctx.snapshot.validations.get(reuse.sha256) ?? notValidated(NOT_RECORDED),
      })
      continue
    }
    entries.push(await convert(ctx, file))
  }
  return entries
}
