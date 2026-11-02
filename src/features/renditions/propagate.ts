import { and, eq, isNull } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { boardPacketItems, documentRenditions, rtkReleaseItems } from '@/db/schema'
import type { ObjectStore } from '@/features/storage/objectStore'

export type RevocationKind = 'revoked' | 'superseded'

export async function onApprovalRevoked(
  tx: Tx,
  input: { approvalId: string; versionId: string; revokedAt: Date; kind: RevocationKind },
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted()
  const removed = await tx
    .delete(documentRenditions)
    .where(eq(documentRenditions.versionId, input.versionId))
    .returning({ key: documentRenditions.storageKey })
  await tx
    .update(boardPacketItems)
    .set({ withdrawnAt: input.revokedAt, withdrawnReason: 'revoked' })
    .where(
      and(eq(boardPacketItems.approvalId, input.approvalId), isNull(boardPacketItems.withdrawnAt)),
    )
  if (input.kind === 'revoked') {
    await tx
      .update(rtkReleaseItems)
      .set({ withdrawnAt: input.revokedAt, withdrawnReason: 'revoked' })
      .where(
        and(eq(rtkReleaseItems.versionId, input.versionId), isNull(rtkReleaseItems.withdrawnAt)),
      )
  }
  return removed.map((r) => r.key)
}

export async function deleteDerivedObjects(
  store: ObjectStore | undefined,
  keys: string[],
  signal: AbortSignal,
): Promise<void> {
  if (store === undefined) return
  for (const key of keys) await store.delete(key, signal)
}
