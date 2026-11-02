import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { abutterLists, remediationTasks } from '@/db/schema'

export const STALE_LIST_TASK_KIND = 'regenerate_abutter_list'
const STALE_LIST_TRANSITION = 'abutter_list:determination_changed'
const DETERMINATION_CHANGED = 'determination changed'

export async function flagIssuedListStale(
  db: DbOrTx,
  applicationId: string,
  signal: AbortSignal,
  cause: string = DETERMINATION_CHANGED,
): Promise<void> {
  signal.throwIfAborted()
  const [issued] = await db
    .select({ id: abutterLists.id })
    .from(abutterLists)
    .where(and(eq(abutterLists.applicationId, applicationId), eq(abutterLists.status, 'issued')))
  if (issued === undefined) return
  const [open] = await db
    .select({ id: remediationTasks.id })
    .from(remediationTasks)
    .where(
      and(
        eq(remediationTasks.applicationId, applicationId),
        eq(remediationTasks.kind, STALE_LIST_TASK_KIND),
        eq(remediationTasks.status, 'open'),
      ),
    )
  if (open !== undefined) return
  await db.insert(remediationTasks).values({
    applicationId,
    kind: STALE_LIST_TASK_KIND,
    description: `Regenerate the abutter list: ${cause}`,
    transitionId: STALE_LIST_TRANSITION,
  })
}
