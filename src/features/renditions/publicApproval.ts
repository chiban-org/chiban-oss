import { and, desc, inArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { documentVersions } from '@/db/schema'
import { insertSystemApproval } from '@/features/renditions/approvals'

export async function approveLatestForPublic(
  tx: Tx,
  documentIds: string[],
  statement: string,
): Promise<void> {
  const versions = await tx
    .select({
      id: documentVersions.id,
      documentId: documentVersions.documentId,
      role: documentVersions.role,
    })
    .from(documentVersions)
    .where(
      and(
        inArray(documentVersions.documentId, documentIds),
        inArray(documentVersions.role, ['public_redacted', 'original']),
      ),
    )
    .orderBy(desc(documentVersions.createdAt), desc(documentVersions.id))
  for (const documentId of documentIds) {
    const own = versions.filter((v) => v.documentId === documentId)
    const chosen =
      own.find((v) => v.role === 'public_redacted') ?? own.find((v) => v.role === 'original')
    if (chosen === undefined) continue
    await insertSystemApproval(tx, { documentId, versionId: chosen.id, statement })
  }
}
