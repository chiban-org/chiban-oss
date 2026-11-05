import { and, eq, isNotNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applications, projectParties } from '@/db/schema'
import type { NotificationPayload } from '@/features/notifications/queue'

export async function isRemovalNoticeToFormerContractor(
  db: DbOrTx,
  row: { event: string; applicationId: string; recipientUserId: string; payload: unknown },
): Promise<boolean> {
  const payload = row.payload as NotificationPayload
  if (row.event !== 'permit_corrected' || payload.contractorRemoved !== true) return false
  const [former] = await db
    .select({ id: projectParties.id })
    .from(applications)
    .innerJoin(projectParties, eq(projectParties.projectId, applications.projectId))
    .where(
      and(
        eq(applications.id, row.applicationId),
        eq(projectParties.userId, row.recipientUserId),
        eq(projectParties.role, 'contractor'),
        isNotNull(projectParties.removedAt),
      ),
    )
    .limit(1)
  return former !== undefined
}
