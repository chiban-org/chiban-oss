import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalJson } from '@/features/export/canonical'

export const EXPORT_FORMAT_VERSION = '1.0.0'

const sha256 = z.string().regex(/^[0-9a-f]{64}$/)

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
