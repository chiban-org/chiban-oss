import { and, eq, inArray, lt, notInArray, or, sql } from 'drizzle-orm'
import type { Db, DbOrTx } from '@/db/client'
import {
  anonymousIntakeProbeTokens,
  complaints,
  documents,
  documentText,
  documentVersions,
  enforcementCases,
  files,
  parcelRecordLinks,
  preservationRecords,
  retentionAssignments,
} from '@/db/schema'
import { hashProbeToken } from '@/features/anonymousIntake/probeToken'
import type { ObjectStore } from '@/features/storage/objectStore'

async function probeOnlyCaseIds(db: DbOrTx): Promise<string[]> {
  const rows = await db
    .select({ caseId: complaints.caseId })
    .from(complaints)
    .where(eq(complaints.isProbe, true))
  const caseIds = [...new Set(rows.flatMap((r) => (r.caseId === null ? [] : [r.caseId])))]
  if (caseIds.length === 0) return []
  const shared = await db
    .select({ caseId: complaints.caseId })
    .from(complaints)
    .where(and(inArray(complaints.caseId, caseIds), eq(complaints.isProbe, false)))
  const keep = new Set(shared.map((r) => r.caseId))
  return caseIds.filter((id) => !keep.has(id))
}

export async function purgeProbes(
  db: Db,
  store: ObjectStore,
  probeToken: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted()
  const orphaned = await db.transaction(async (tx) => {
    const caseIds = await probeOnlyCaseIds(tx)
    const docs =
      caseIds.length === 0
        ? []
        : await tx
            .select({ id: documents.id })
            .from(documents)
            .where(
              and(
                eq(documents.recordKind, 'enforcement_case'),
                inArray(documents.recordId, caseIds),
              ),
            )
    const docIds = docs.map((d) => d.id)
    const versions =
      docIds.length === 0
        ? []
        : await tx
            .select({ id: documentVersions.id, sha: documentVersions.fileSha256 })
            .from(documentVersions)
            .where(inArray(documentVersions.documentId, docIds))
    const versionIds = versions.map((v) => v.id)
    if (versionIds.length > 0) {
      await tx.delete(documentText).where(inArray(documentText.versionId, versionIds))
      await tx
        .delete(preservationRecords)
        .where(
          or(
            inArray(preservationRecords.originalVersionId, versionIds),
            inArray(preservationRecords.pdfaVersionId, versionIds),
          ),
        )
      await tx.execute(sql`select set_config('chiban.probe_purge', 'on', true)`)
      await tx.delete(documentVersions).where(inArray(documentVersions.id, versionIds))
      await tx.execute(sql`select set_config('chiban.probe_purge', 'off', true)`)
    }
    if (docIds.length > 0) {
      await tx
        .delete(retentionAssignments)
        .where(
          and(
            eq(retentionAssignments.recordKind, 'document'),
            inArray(retentionAssignments.recordId, docIds),
          ),
        )
      await tx
        .delete(parcelRecordLinks)
        .where(
          and(
            eq(parcelRecordLinks.recordKind, 'document'),
            inArray(parcelRecordLinks.recordId, docIds),
          ),
        )
      await tx.delete(documents).where(inArray(documents.id, docIds))
    }
    await tx.delete(complaints).where(eq(complaints.isProbe, true))
    if (caseIds.length > 0) {
      await tx
        .delete(parcelRecordLinks)
        .where(
          and(
            eq(parcelRecordLinks.recordKind, 'enforcement_case'),
            inArray(parcelRecordLinks.recordId, caseIds),
          ),
        )
      await tx.delete(enforcementCases).where(inArray(enforcementCases.id, caseIds))
    }
    await tx
      .delete(anonymousIntakeProbeTokens)
      .where(
        or(
          eq(anonymousIntakeProbeTokens.tokenHash, hashProbeToken(probeToken)),
          lt(anonymousIntakeProbeTokens.expiresAt, new Date()),
        ),
      )
    const shas = [...new Set(versions.map((v) => v.sha))]
    if (shas.length === 0) return []
    const stillUsed = await tx
      .select({ sha: documentVersions.fileSha256 })
      .from(documentVersions)
      .where(inArray(documentVersions.fileSha256, shas))
    const used = stillUsed.map((r) => r.sha)
    const unused = used.length === 0 ? shas : shas.filter((s) => !used.includes(s))
    if (unused.length === 0) return []
    const gone = await tx
      .delete(files)
      .where(
        and(
          inArray(files.sha256, unused),
          notInArray(files.sha256, used.length === 0 ? [''] : used),
        ),
      )
      .returning({ key: files.storageKey })
    return gone.map((g) => g.key)
  })
  for (const key of orphaned) await store.delete(key, signal)
}
