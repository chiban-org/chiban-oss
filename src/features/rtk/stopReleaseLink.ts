import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db, DbOrTx } from '@/db/client'
import { rtkReleaseItems, rtkReleases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { type RevokeError, revokeApproval } from '@/features/renditions/approvals'
import type { ObjectStore } from '@/features/storage/objectStore'
import { err, type Result } from '@/types/result'

export async function releasedByLink(
  db: DbOrTx,
  approvalId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  const [row] = await db
    .select({ id: rtkReleases.id })
    .from(rtkReleaseItems)
    .innerJoin(rtkReleases, eq(rtkReleases.id, rtkReleaseItems.releaseId))
    .where(
      and(
        eq(rtkReleaseItems.approvalId, approvalId),
        eq(rtkReleases.method, 'electronic_link'),
        isNull(rtkReleaseItems.withdrawnAt),
      ),
    )
    .limit(1)
  return row !== undefined
}

export async function stopReleaseLink(
  db: Db,
  actor: Actor,
  input: { approvalId: string; reason: string },
  signal: AbortSignal,
  store?: ObjectStore,
): Promise<Result<void, RevokeError | 'not_link_release'>> {
  if (!z.string().uuid().safeParse(input.approvalId).success) return err('invalid')
  if (!(await releasedByLink(db, input.approvalId, signal))) return err('not_link_release')
  return await revokeApproval(db, actor, input, signal, store)
}
