import { Readable } from 'node:stream'
import { z } from 'zod'
import { readAll } from '@/features/export/readArchive'
import type { StorageTarget, TargetError } from '@/features/export/targets/types'
import { err, ok, type Result } from '@/types/result'

export const EXPORT_ROOT = 'chiban-export'
export const INDEX_PATH = `${EXPORT_ROOT}/exports.json`

const INDEX_LIMIT = 16 * 1024 * 1024

const indexSchema = z.object({
  version: z.literal(1),
  exports: z.array(
    z.object({
      exportId: z.uuid(),
      folder: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .or(z.string().regex(/^\d{4}-\d{2}-\d{1,3}$/)),
    }),
  ),
})

export type ExportIndex = z.infer<typeof indexSchema>['exports']

export async function readIndex(
  target: StorageTarget,
  signal: AbortSignal,
): Promise<Result<ExportIndex, TargetError>> {
  const got = await target.get(INDEX_PATH, signal)
  if (!got.ok) {
    return got.error === 'not_found' ? ok([]) : err(got.error)
  }
  const parsed = indexSchema.safeParse(
    JSON.parse((await readAll(got.value, INDEX_LIMIT)).toString('utf8')),
  )
  if (!parsed.success) return err({ kind: 'bad_shape', detail: `${INDEX_PATH} is not readable` })
  return ok(parsed.data.exports)
}

export async function recordInIndex(
  target: StorageTarget,
  entry: { exportId: string; folder: string },
  signal: AbortSignal,
): Promise<Result<void, TargetError>> {
  const current = await readIndex(target, signal)
  if (!current.ok) return current
  const next = [...current.value.filter((e) => e.folder !== entry.folder), entry]
  const bytes = Buffer.from(`${JSON.stringify({ version: 1, exports: next }, null, 2)}\n`, 'utf8')
  return await target.put(INDEX_PATH, Readable.from([bytes]), bytes.length, signal)
}
