import { and, eq, isNull, ne } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { rtkReleaseItems, rtkReleases } from '@/db/schema'

export async function releasedOffline(db: DbOrTx, versionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: rtkReleases.id })
    .from(rtkReleaseItems)
    .innerJoin(rtkReleases, eq(rtkReleases.id, rtkReleaseItems.releaseId))
    .where(
      and(
        eq(rtkReleaseItems.versionId, versionId),
        ne(rtkReleases.method, 'electronic_link'),
        isNull(rtkReleaseItems.withdrawnAt),
      ),
    )
    .limit(1)
  return row !== undefined
}
