import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { documents } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { mayOpen } from '@/features/staffNav/navItems'
import { loadNavViewer } from '@/features/staffNav/viewer'

const STAFF_PAGES: Partial<Record<string, string>> = {
  parcel: '/staff/parcels',
  application: '/staff/applications',
  enforcement_case: '/staff/enforcement',
}

export async function staffRecordHref(
  db: DbOrTx,
  actor: Actor,
  documentId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const [doc] = await db
    .select({ recordKind: documents.recordKind, recordId: documents.recordId })
    .from(documents)
    .where(eq(documents.id, documentId))
  const base = doc === undefined ? undefined : STAFF_PAGES[doc.recordKind]
  if (doc === undefined || base === undefined) return null
  if (!mayOpen(base, await loadNavViewer(db, actor, signal))) return null
  return `${base}/${doc.recordId}`
}
