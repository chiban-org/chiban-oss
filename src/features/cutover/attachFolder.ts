import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { cutoverRows, documents, documentVersions } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { requireCapability } from '@/features/authz/capabilities'
import { attachDocument } from '@/features/documents/attach'
import { ingestLocalFile } from '@/features/files/ingestLocal'
import { ALLOWED_UPLOAD_TYPES } from '@/features/files/sniff'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, ok, type Result } from '@/types/result'

export interface AttachFolderReport {
  attached: number
  deduplicated: number
  unmatchedFolders: string[]
}

async function alreadyAttached(db: Db, applicationId: string, sha256: string): Promise<boolean> {
  const rows = await db
    .select({ id: documents.id })
    .from(documents)
    .innerJoin(documentVersions, eq(documentVersions.documentId, documents.id))
    .where(
      and(
        eq(documents.recordKind, 'application'),
        eq(documents.recordId, applicationId),
        eq(documentVersions.fileSha256, sha256),
      ),
    )
    .limit(1)
  return rows.length > 0
}

export async function attachCutoverFolder(
  db: Db,
  store: ObjectStore,
  actor: Actor,
  input: { root: string },
  signal: AbortSignal,
): Promise<Result<AttachFolderReport, 'forbidden'>> {
  signal.throwIfAborted()
  const allowed = await requireCapability(db, actor.userId, 'cutover.import', signal)
  if (!allowed.ok) return err('forbidden')
  const report: AttachFolderReport = { attached: 0, deduplicated: 0, unmatchedFolders: [] }
  const folders = (await readdir(input.root, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  for (const folder of folders) {
    const [row] = await db
      .select({ applicationId: cutoverRows.applicationId })
      .from(cutoverRows)
      .where(eq(cutoverRows.legacyNumber, folder))
    if (row === undefined) {
      report.unmatchedFolders.push(folder)
      continue
    }
    const names = (await readdir(join(input.root, folder), { withFileTypes: true }))
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort()
    for (const name of names) {
      const stored = await ingestLocalFile(
        db,
        store,
        join(input.root, folder, name),
        ALLOWED_UPLOAD_TYPES,
        signal,
      )
      if (!stored.ok) continue
      if (await alreadyAttached(db, row.applicationId, stored.value.sha256)) continue
      await db.transaction(async (tx) => {
        await attachDocument(
          tx,
          actor,
          {
            target: { kind: 'application', id: row.applicationId },
            title: name,
            docKind: 'attachment',
            file: {
              sha256: stored.value.sha256,
              filename: name,
              contentType: stored.value.contentType,
            },
          },
          signal,
        )
      })
      report.attached += 1
      if (!stored.value.created) report.deduplicated += 1
    }
  }
  return ok(report)
}
