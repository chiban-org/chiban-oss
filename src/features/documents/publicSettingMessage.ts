import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { documents, enforcementCases } from '@/db/schema'

export function publicSettingMessage(input: {
  isPublic: boolean
  heldByPrivateCase: boolean
}): string {
  if (!input.isPublic) return 'Saved. The document is hidden from the public site.'
  return input.heldByPrivateCase
    ? 'Saved. It shows on the public site once the case is shown there.'
    : 'Saved. The approved copy shows on the public site.'
}

export async function heldByPrivateCase(db: Db, documentId: string): Promise<boolean> {
  const [row] = await db
    .select({ recordKind: documents.recordKind, isPublic: enforcementCases.isPublic })
    .from(documents)
    .leftJoin(enforcementCases, eq(enforcementCases.id, documents.recordId))
    .where(eq(documents.id, documentId))
  return row?.recordKind === 'enforcement_case' && row.isPublic !== true
}
