import { and, eq, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { hearings } from '@/db/schema'

export async function hasElectedHearing(db: DbOrTx, applicationId: string): Promise<boolean> {
  const [found] = await db
    .select({ id: hearings.id })
    .from(hearings)
    .where(
      and(
        eq(hearings.applicationId, applicationId),
        ne(hearings.status, 'cancelled'),
        ne(hearings.kind, 'rehearing'),
      ),
    )
    .limit(1)
  return found !== undefined
}
