import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '@/db/client'
import { migrationBatches, migrationItems, parcelIdFormats } from '@/db/schema'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { digestFile } from '@/features/files/ingestLocal'
import { mayMigrate } from '@/features/migration/access'
import { compileFolderPattern } from '@/features/migration/folderPattern'
import type { ScanInput } from '@/features/migration/types'
import { findSeries } from '@/features/records/series'
import { err, ok, type Result } from '@/types/result'

export type ScanError =
  | 'forbidden'
  | 'invalid_input'
  | 'invalid_pattern'
  | 'unknown_series'
  | 'unknown_format'
  | 'source_unreadable'

const INSERT_CHUNK = 500

const scanInputSchema = z.object({
  root: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  seriesKey: z.string().min(1),
  folderPattern: z.string().min(1),
  idFormat: z.string().min(1),
})

interface Found {
  sourcePath: string
  sizeBytes: number
  sha256: string
}

async function listFiles(root: string, relative: string): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true })
  const found: string[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = relative === '' ? entry.name : `${relative}/${entry.name}`
    if (entry.isDirectory()) found.push(...(await listFiles(root, child)))
    else if (entry.isFile()) found.push(child)
  }
  return found
}

async function hashAll(root: string, paths: string[], signal: AbortSignal): Promise<Found[]> {
  const result: Found[] = []
  for (const sourcePath of paths) {
    const digest = await digestFile(path.join(root, sourcePath), signal)
    result.push({ sourcePath, sizeBytes: digest.size, sha256: digest.sha256 })
  }
  return result
}

export async function scanSource(
  db: Db,
  actor: Actor,
  rawInput: ScanInput,
  signal: AbortSignal,
): Promise<Result<{ batchId: string; files: number }, ScanError>> {
  signal.throwIfAborted()
  if (!(await mayMigrate(db, actor, signal))) return err('forbidden')
  const parsed = scanInputSchema.safeParse(rawInput)
  if (!parsed.success) return err('invalid_input')
  const input = { ...parsed.data, root: path.resolve(parsed.data.root) }
  if (compileFolderPattern(input.folderPattern) === null) return err('invalid_pattern')
  if (findSeries(input.seriesKey) === null) return err('unknown_series')
  const [format] = await db
    .select({ key: parcelIdFormats.key })
    .from(parcelIdFormats)
    .where(eq(parcelIdFormats.key, input.idFormat))
  if (format === undefined) return err('unknown_format')
  let found: Found[]
  try {
    found = await hashAll(input.root, await listFiles(input.root, ''), signal)
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw e
    return err('source_unreadable')
  }
  const batchId = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(migrationBatches)
      .values({
        name: input.name,
        sourceRoot: input.root,
        seriesKey: input.seriesKey,
        folderPattern: input.folderPattern,
        idFormat: input.idFormat,
        status: 'scanned',
        createdBy: actor.userId,
      })
      .returning({ id: migrationBatches.id })
    const id = batch?.id ?? ''
    for (let i = 0; i < found.length; i += INSERT_CHUNK) {
      await tx
        .insert(migrationItems)
        .values(found.slice(i, i + INSERT_CHUNK).map((f) => ({ ...f, batchId: id })))
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'migration.scan',
        entityType: 'migration_batch',
        entityId: id,
        after: { files: found.length, seriesKey: input.seriesKey, idFormat: input.idFormat },
      },
      signal,
    )
    return id
  })
  return ok({ batchId, files: found.length })
}
