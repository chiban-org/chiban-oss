import { Readable } from 'node:stream'
import type { Db } from '@/db/client'
import type { ArchiveEntry } from '@/features/export/archiveTypes'
import { EXPORT_ROOT, readIndex } from '@/features/export/exportIndex'
import {
  type ImportArchiveError,
  type ImportArchiveReport,
  importArchive,
} from '@/features/export/importArchive'
import { manifestSchema } from '@/features/export/manifest'
import type { ArchiveSource } from '@/features/export/readArchive'
import { getBytesOrThrow, getOrThrow, TargetFailure } from '@/features/export/targets/targetFailure'
import type { StorageTarget, TargetError } from '@/features/export/targets/types'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, type Result } from '@/types/result'

export type ImportFromTargetError =
  | ImportArchiveError
  | 'month_not_found'
  | { unresolved: string[] }
  | { target: TargetError }

const UNKNOWN_SIZE = 0

function bytesEntry(path: string, bytes: Buffer): ArchiveEntry {
  return { path, size: bytes.length, body: Readable.from([bytes]) }
}

export async function importFromTarget(
  db: Db,
  store: ObjectStore,
  target: StorageTarget,
  folder: string,
  signal: AbortSignal,
): Promise<Result<ImportArchiveReport, ImportFromTargetError>> {
  try {
    const monthDir = `${EXPORT_ROOT}/${folder}`
    const present = await target.exists(`${monthDir}/manifest.json`, signal)
    if (!present.ok) return err({ target: present.error })
    if (!present.value) return err('month_not_found')
    const manifestRaw = await getBytesOrThrow(target, `${monthDir}/manifest.json`, signal)
    const parsed = manifestSchema.safeParse(JSON.parse(manifestRaw.toString('utf8')))
    if (!parsed.success) return err('manifest_mismatch')
    const manifest = parsed.data
    const index = await readIndex(target, signal)
    if (!index.ok) return err({ target: index.error })
    const months = new Map(index.value.map((e) => [e.exportId, e.folder]))
    months.set(manifest.exportId, folder)
    const unresolved = manifest.entities.filter((e) => !months.has(e.inExport)).map((e) => e.name)
    if (unresolved.length > 0) return err({ unresolved })
    const source: ArchiveSource = {
      async *entries() {
        yield bytesEntry('manifest.json', manifestRaw)
        for (const name of ['manifest.sha256', 'FORMAT.md']) {
          yield bytesEntry(name, await getBytesOrThrow(target, `${monthDir}/${name}`, signal))
        }
        for (const entity of manifest.entities) {
          const from = `${EXPORT_ROOT}/${months.get(entity.inExport)}/${entity.path}`
          yield {
            path: entity.path,
            size: UNKNOWN_SIZE,
            body: await getOrThrow(target, from, signal),
          }
        }
        for (const file of manifest.files) {
          const body = await getOrThrow(target, `${EXPORT_ROOT}/${file.path}`, signal)
          yield { path: file.path, size: file.size, body }
        }
      },
    }
    return await importArchive(db, store, source, signal)
  } catch (e) {
    if (e instanceof TargetFailure) return err({ target: e.error })
    throw e
  }
}
