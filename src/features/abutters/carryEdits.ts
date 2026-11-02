import { and, eq, inArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { abutterListCandidates, abutterListRecipients } from '@/db/schema'
import { wasCorrected } from '@/features/abutters/draft'
import type { Recipient } from '@/features/abutters/resolution'

export async function carryExclusions(tx: Tx, fromListId: string, toListId: string): Promise<void> {
  const leftOff = await tx
    .select()
    .from(abutterListCandidates)
    .where(
      and(eq(abutterListCandidates.listId, fromListId), eq(abutterListCandidates.excluded, true)),
    )
  for (const row of leftOff) {
    await tx
      .update(abutterListCandidates)
      .set({ excluded: true, exclusionReason: row.exclusionReason })
      .where(
        and(
          eq(abutterListCandidates.listId, toListId),
          eq(abutterListCandidates.parcelId, row.parcelId),
        ),
      )
  }
}

export async function carryRecipientEdits(
  tx: Tx,
  fromListId: string,
  toListId: string,
): Promise<void> {
  const prior = await tx
    .select()
    .from(abutterListRecipients)
    .where(eq(abutterListRecipients.listId, fromListId))
  const edited = prior.filter((r) => wasCorrected(r.data as Recipient) || r.qualifies !== null)
  if (edited.length === 0) return
  const fresh = await tx
    .select()
    .from(abutterListRecipients)
    .where(
      and(
        eq(abutterListRecipients.listId, toListId),
        inArray(
          abutterListRecipients.originKey,
          edited.map((r) => r.originKey),
        ),
      ),
    )
  for (const row of fresh) {
    const before = edited.find((r) => r.originKey === row.originKey)
    if (before === undefined) continue
    await tx
      .update(abutterListRecipients)
      .set({
        ...(wasCorrected(before.data as Recipient) ? { data: before.data } : {}),
        qualifies: before.qualifies,
        decisionReason: before.decisionReason,
      })
      .where(eq(abutterListRecipients.id, row.id))
  }
}
