import { and, eq, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { hearings } from '@/db/schema'
import { type CivilDate, compareCivil } from '@/types/civilDate'

export interface ElectedHearing {
  firstHeldOn: CivilDate | null
}

export async function electedHearing(
  db: DbOrTx,
  applicationId: string,
): Promise<ElectedHearing | null> {
  const rows = await db
    .select({ heldOn: hearings.heldOn })
    .from(hearings)
    .where(
      and(
        eq(hearings.applicationId, applicationId),
        ne(hearings.status, 'cancelled'),
        ne(hearings.kind, 'rehearing'),
      ),
    )
  if (rows.length === 0) return null
  const held = rows
    .flatMap((r) => (r.heldOn === null ? [] : [r.heldOn as CivilDate]))
    .sort(compareCivil)
  return { firstHeldOn: held[0] ?? null }
}
