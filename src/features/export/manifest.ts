import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalJson } from '@/features/export/canonical'
import { pdfaValidationSchema } from '@/features/preservation/verapdf'

export const EXPORT_FORMAT_VERSION = '2.2.0'

const sha256 = z.string().regex(/^[0-9a-f]{64}$/)

const pdfaRenditionSchema = z.object({
  sourceSha256: sha256,
  status: z.enum(['stored', 'converted', 'failed']),
  path: z.string().nullable(),
  sha256: sha256.nullable(),
  size: z.number().int().nonnegative().nullable(),
  reason: z.string().nullable(),
  detail: z.string().nullable(),
  validation: pdfaValidationSchema.optional(),
})

const tablesSchema = z.object({
  csv: z.array(
    z.object({
      entity: z.string(),
      path: z.string(),
      count: z.number().int().nonnegative(),
      sha256,
      size: z.number().int().nonnegative(),
    }),
  ),
  workbook: z.object({
    path: z.string(),
    sha256,
    size: z.number().int().nonnegative(),
    sheets: z.array(
      z.object({ entity: z.string(), name: z.string(), rows: z.number().int().nonnegative() }),
    ),
  }),
})

export type PdfaRenditionEntry = z.infer<typeof pdfaRenditionSchema>
export type TablesEntry = z.infer<typeof tablesSchema>

export const manifestSchema = z.object({
  format: z.literal('chiban-export'),
  formatVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  kind: z.enum(['business', 'incremental']),
  exportId: z.uuid(),
  baseExportId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  town: z.object({ name: z.string(), stateCode: z.string(), timeZone: z.string() }),
  appVersion: z.string(),
  pack: z.object({ id: z.string(), version: z.string(), hash: z.string() }),
  migrationHead: z.string(),
  entities: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      count: z.number().int().nonnegative(),
      sha256,
      inExport: z.uuid(),
    }),
  ),
  files: z.array(
    z.object({
      sha256,
      size: z.number().int().nonnegative(),
      contentType: z.string(),
      path: z.string(),
      inExport: z.uuid(),
    }),
  ),
  tables: tablesSchema.optional(),
  pdfa: z.array(pdfaRenditionSchema).optional(),
})

export type ExportManifest = z.infer<typeof manifestSchema>

export function manifestBytes(manifest: ExportManifest): Buffer {
  return Buffer.from(`${JSON.stringify(JSON.parse(canonicalJson(manifest)), null, 2)}\n`, 'utf8')
}

export function manifestChecksumLine(bytes: Uint8Array): string {
  return `${createHash('sha256').update(bytes).digest('hex')}  manifest.json\n`
}

export function filePath(sha: string): string {
  return `files/sha256/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`
}

export function csvPath(entityName: string): string {
  return `tables/${entityName}.csv`
}

export const WORKBOOK_PATH = 'tables/chiban-export.xlsx'

export function pdfaPath(sourceSha: string): string {
  return `pdfa/sha256/${sourceSha.slice(0, 2)}/${sourceSha.slice(2, 4)}/${sourceSha}.pdf`
}
