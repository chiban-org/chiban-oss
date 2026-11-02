import { and, count, eq } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { env } from '@/config/env'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Db } from '@/db/client'
import {
  auditLog,
  documents,
  documentText,
  documentVersions,
  files,
  migrationItems,
  parcelRecordLinks,
  preservationRecords,
} from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { createOcrmypdfConverter, type OcrConverter } from '@/features/migration/ocrmypdf'
import { runBatch } from '@/features/migration/runBatch'
import { scanSource } from '@/features/migration/scanSource'
import type { ObjectStore } from '@/features/storage/objectStore'
import type { TestDb } from '@/test/db'
import {
  buildSourceTree,
  FOLDER_PATTERN,
  importerActor,
  LOT_14,
  LOT_15,
  SERIES_KEY,
} from '@/test/migrationFixtures'
import { makeTestStore } from '@/test/minio'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

export const signal = new AbortController().signal
export const WORLD_TIMEOUT_MS = 300_000

export interface MigrationWorld {
  db: Db
  store: ObjectStore
  importer: Actor
  publisher: Actor
  reviewer: Actor
  applicant: Actor
  parcel14: string
  parcel15: string
  root: string
  batchId: string
  converter: OcrConverter
  ocrCalls: () => number
}

export function scanInput(root: string) {
  return {
    root,
    name: 'Town Hall basement scans',
    seriesKey: SERIES_KEY,
    folderPattern: FOLDER_PATTERN,
    idFormat: 'cama15',
  }
}

export function countingConverter(): { converter: OcrConverter; calls: () => number } {
  const real = createOcrmypdfConverter({
    path: env.OCRMYPDF_PATH,
    language: 'eng',
    timeoutMs: 120_000,
  })
  let calls = 0
  return {
    converter: {
      ocrToPdfA: (inputPath, kind, s) => {
        calls += 1
        return real.ocrToPdfA(inputPath, kind, s)
      },
    },
    calls: () => calls,
  }
}

export async function scanAndRun(
  world: Pick<MigrationWorld, 'db' | 'store' | 'importer' | 'converter' | 'root'>,
): Promise<string> {
  const scanned = await scanSource(world.db, world.importer, scanInput(world.root), signal)
  if (!scanned.ok) throw new AppError(ErrorIds.DB_INVARIANT, `scan: ${scanned.error}`)
  const ran = await runBatch(
    world.db,
    world.store,
    world.converter,
    world.importer,
    scanned.value.batchId,
    signal,
  )
  if (!ran.ok) throw new AppError(ErrorIds.DB_INVARIANT, `run: ${ran.error}`)
  return scanned.value.batchId
}

export async function buildMigrationWorld(handle: TestDb): Promise<MigrationWorld> {
  const { db } = handle
  await seedParcelWorld(db)
  const { converter, calls } = countingConverter()
  const base = {
    db,
    store: (await makeTestStore()).store,
    importer: await importerActor(db),
    publisher: await staffActor(db, 'staff'),
    reviewer: await staffActor(db, 'reviewer'),
    applicant: await staffActor(db, 'applicant'),
    parcel14: await makeParcel(db, [{ format: 'cama15', value: LOT_14 }]),
    parcel15: await makeParcel(db, [{ format: 'cama15', value: LOT_15 }]),
    root: await buildSourceTree(),
    converter,
    ocrCalls: calls,
  }
  return { ...base, batchId: await scanAndRun(base) }
}

export async function itemAt(world: MigrationWorld, sourcePath: string, batchId?: string) {
  const [row] = await world.db
    .select()
    .from(migrationItems)
    .where(
      and(
        eq(migrationItems.batchId, batchId ?? world.batchId),
        eq(migrationItems.sourcePath, sourcePath),
      ),
    )
  if (row === undefined) throw new AppError(ErrorIds.DB_INVARIANT, `no item ${sourcePath}`)
  return row
}

export async function versionsOf(world: MigrationWorld, documentId: string | null) {
  return await world.db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId ?? ''))
}

const COUNTED: PgTable[] = [
  documents,
  documentVersions,
  files,
  parcelRecordLinks,
  preservationRecords,
  documentText,
  auditLog,
  migrationItems,
]

export async function tableCounts(db: Db): Promise<number[]> {
  const result: number[] = []
  for (const table of COUNTED) {
    const [row] = await db.select({ n: count() }).from(table)
    result.push(row?.n ?? 0)
  }
  return result
}
