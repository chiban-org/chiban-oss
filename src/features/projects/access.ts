import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { projectParties } from '@/db/schema'

export { hasFullRecordAccess } from '@/features/access/roles'

export async function isActiveParty(
  db: DbOrTx,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: projectParties.id })
    .from(projectParties)
    .where(
      and(
        eq(projectParties.projectId, projectId),
        eq(projectParties.userId, userId),
        isNull(projectParties.removedAt),
      ),
    )
    .limit(1)
  return rows.length > 0
}
