import { and, asc, eq, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documentText, documentVersions, migrationItems } from '@/db/schema'

export type MigrationItemRow = typeof migrationItems.$inferSelect

export async function findDuplicate(
  db: DbOrTx,
  item: MigrationItemRow,
  folderKey: string,
): Promise<MigrationItemRow | null> {
  const [row] = await db
    .select()
    .from(migrationItems)
    .where(
      and(
        eq(migrationItems.sha256, item.sha256),
        eq(migrationItems.folderKey, folderKey),
        eq(migrationItems.outcome, 'imported'),
        ne(migrationItems.id, item.id),
      ),
    )
    .orderBy(asc(migrationItems.createdAt), asc(migrationItems.id))
    .limit(1)
  return row ?? null
}

export async function findReusableOcr(
  db: DbOrTx,
  sha256: string,
): Promise<{ pdfSha256: string; text: string } | null> {
  const [row] = await db
    .select({ pdfSha256: documentVersions.fileSha256, text: documentText.text })
    .from(migrationItems)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.documentId, migrationItems.documentId),
        eq(documentVersions.role, 'pdfa'),
      ),
    )
    .innerJoin(documentText, eq(documentText.versionId, documentVersions.id))
    .where(
      and(
        eq(migrationItems.sha256, sha256),
        eq(migrationItems.outcome, 'imported'),
        eq(migrationItems.ocrStatus, 'complete'),
      ),
    )
    .limit(1)
  return row ?? null
}
