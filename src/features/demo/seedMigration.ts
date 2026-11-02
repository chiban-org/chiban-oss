import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Db } from '@/db/client'
import { migrationBatches } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { must } from '@/features/demo/seedPermitSupport'
import type { OcrConverter } from '@/features/migration/ocrmypdf'
import { runBatch } from '@/features/migration/runBatch'
import { scanSource } from '@/features/migration/scanSource'
import { renderPdf } from '@/features/pdf/renderPdf'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok } from '@/types/result'

const BATCH_NAME = 'Town Hall basement scans'
const SERIES_KEY = 'nh.rs.correspondence_administrative'
const FOLDER_PATTERN = String.raw`^Map (?<map>\d+)/Lot (?<lot>\d+)(?:-(?<sub>\d+))?`
const LOCKED_NAME = 'locked.pdf'

const SCANS = [
  { path: 'Map 7/Lot 1/scan.pdf', line: 'Letter about the Fernwood Lane culvert' },
  { path: 'Map 7/Lot 3/locked.pdf', line: 'Password protected survey copy' },
  { path: 'Map 9/Lot 99/deed.pdf', line: 'Quitclaim deed for an unmapped lot' },
]

export const demoOcrConverter: OcrConverter = {
  async ocrToPdfA(inputPath) {
    if (path.basename(inputPath) === LOCKED_NAME) {
      return err({ reason: 'encrypted', exitCode: 8, detail: 'Input PDF is encrypted' })
    }
    const pdf = new Uint8Array(await readFile(inputPath))
    return ok({ pdf, text: 'Alder Pond legacy scan' })
  },
}

async function writeSourceTree(root: string): Promise<void> {
  for (const scan of SCANS) {
    const target = path.join(root, scan.path)
    await mkdir(path.dirname(target), { recursive: true })
    const pdf = await renderPdf({
      title: 'Legacy scan',
      townName: 'Town of Alder Pond',
      scale: 'document',
      blocks: [{ kind: 'paragraph', text: scan.line }],
    })
    await writeFile(target, pdf)
  }
}

export async function seedMigration(
  db: Db,
  store: ObjectStore,
  converter: OcrConverter,
  admin: Actor,
  root: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const existing = await db.select({ id: migrationBatches.id }).from(migrationBatches)
  if (existing.length > 0) return false
  await writeSourceTree(root)
  const scanned = must(
    await scanSource(
      db,
      admin,
      {
        root,
        name: BATCH_NAME,
        seriesKey: SERIES_KEY,
        folderPattern: FOLDER_PATTERN,
        idFormat: 'cama15',
      },
      signal,
    ),
    'scan legacy source',
  )
  must(await runBatch(db, store, converter, admin, scanned.batchId, signal), 'run migration batch')
  return true
}
