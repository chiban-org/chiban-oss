import { and, inArray, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { configVersions } from '@/db/schema'
import { REFERENCE_KINDS, type ReferenceRow } from '@/features/config/referenceChoices'

export async function loadReferenceRows(db: DbOrTx, signal: AbortSignal): Promise<ReferenceRow[]> {
  signal.throwIfAborted()
  return await db
    .select({
      kind: configVersions.kind,
      key: configVersions.key,
      status: configVersions.status,
      body: configVersions.body,
    })
    .from(configVersions)
    .where(
      and(
        inArray(configVersions.kind, [...REFERENCE_KINDS]),
        ne(configVersions.status, 'superseded'),
      ),
    )
}
