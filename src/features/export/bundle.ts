import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Tx } from '@/db/client'
import type { ArchiveSink } from '@/features/export/archiveTypes'
import {
  csvPath,
  type ExportManifest,
  type PdfaRenditionEntry,
  type TablesEntry,
  WORKBOOK_PATH,
} from '@/features/export/manifest'
import {
  buildPdfaRenditions,
  type PdfaSnapshot,
  type PdfFile,
  pdfaWorkName,
  readPdfaSnapshot,
} from '@/features/export/pdfa/renditions'
import {
  createTableSet,
  csvFileName,
  type TableSet,
  WORKBOOK_FILE,
} from '@/features/export/tabular/tableSet'
import type { PdfaConverter } from '@/features/preservation/ghostscript'
import type { PdfaValidator } from '@/features/preservation/verapdf'
import type { ObjectStore } from '@/features/storage/objectStore'

export interface BundleOptions {
  converter: PdfaConverter
  validator?: PdfaValidator
  maxSheetRows?: number
}

export interface BundleCapture {
  tables: TableSet
  csv: TablesEntry['csv']
  snapshot: PdfaSnapshot
}

export async function startBundle(
  tx: Tx,
  bundle: BundleOptions,
  workDir: string,
): Promise<BundleCapture> {
  return {
    tables: createTableSet(workDir, bundle.maxSheetRows),
    csv: [],
    snapshot: await readPdfaSnapshot(tx),
  }
}

async function hashFile(path: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return { sha256: hash.digest('hex'), size: (await stat(path)).size }
}

export interface FinishInput {
  capture: BundleCapture
  bundle: BundleOptions
  files: PdfFile[]
  workDir: string
  store: ObjectStore
  signal: AbortSignal
}

export async function finishBundle(
  input: FinishInput,
): Promise<{ tables: TablesEntry; pdfa: PdfaRenditionEntry[] }> {
  const { capture, workDir } = input
  const sheets = await capture.tables.finish()
  const workbook = await hashFile(join(workDir, WORKBOOK_FILE))
  const pdfa = await buildPdfaRenditions({
    files: input.files,
    snapshot: capture.snapshot,
    workDir,
    store: input.store,
    converter: input.bundle.converter,
    ...(input.bundle.validator === undefined ? {} : { validator: input.bundle.validator }),
    signal: input.signal,
  })
  return {
    tables: { csv: capture.csv, workbook: { path: WORKBOOK_PATH, ...workbook, sheets } },
    pdfa,
  }
}

export function csvEntry(
  entity: string,
  dumped: { sha256: string; size: number; count: number },
): TablesEntry['csv'][number] {
  return { entity, path: csvPath(entity), ...dumped }
}

export async function emitBundle(
  manifest: ExportManifest,
  workDir: string,
  sink: ArchiveSink,
): Promise<void> {
  const { tables, pdfa } = manifest
  if (tables === undefined) return
  const local = (name: string) => join(workDir, name)
  for (const entry of tables.csv) {
    await sink.write({
      path: entry.path,
      size: entry.size,
      body: createReadStream(local(csvFileName(entry.entity))),
    })
  }
  await sink.write({
    path: tables.workbook.path,
    size: tables.workbook.size,
    body: createReadStream(local(WORKBOOK_FILE)),
  })
  for (const entry of pdfa ?? []) {
    if (entry.status !== 'converted' || entry.path === null || entry.size === null) continue
    await sink.write({
      path: entry.path,
      size: entry.size,
      body: createReadStream(local(pdfaWorkName(entry.sourceSha256))),
    })
  }
}
