import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import {
  documents,
  noticeItems,
  noticeProofSupersessions,
  noticeProofs,
  noticeSets,
} from '@/db/schema'
import { transactionResult } from '@/db/transactionResult'
import { writeAudit } from '@/features/audit/writeAudit'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import type { NoticeChannel } from '@/features/notices/channels'
import { methodAllowed, type ProofMethod, referenceRequired } from '@/features/notices/proofMethods'
import { townToday } from '@/features/town/today'
import { type CivilDate, compareCivil } from '@/types/civilDate'
import { err, ok, type Result } from '@/types/result'

export type ProofError =
  | 'forbidden'
  | 'method_not_allowed'
  | 'reference_required'
  | 'future_date'
  | 'document_not_found'
  | 'item_not_found'

export interface ProofInput {
  itemIds: string[]
  method: ProofMethod
  reference: string | null
  effectiveOn: CivilDate
  documentId: string
}

export async function recordProof(
  db: Db,
  actor: Actor,
  input: ProofInput,
  signal: AbortSignal,
  now: Date = new Date(),
): Promise<Result<{ proofIds: string[] }, ProofError>> {
  signal.throwIfAborted()
  if (!(await hasCapability(db, actor.userId, 'board.record', signal))) return err('forbidden')
  const itemIds = [...new Set(input.itemIds)]
  if (itemIds.length === 0) return err('item_not_found')
  const reference = input.reference?.trim() ?? ''
  return await transactionResult<{ proofIds: string[] }, ProofError>(db, async (tx) => {
    const items = await tx
      .select({
        id: noticeItems.id,
        channel: noticeItems.channel,
        applicationId: noticeSets.applicationId,
      })
      .from(noticeItems)
      .innerJoin(noticeSets, eq(noticeSets.id, noticeItems.setId))
      .where(inArray(noticeItems.id, itemIds))
    if (items.length !== itemIds.length) return err('item_not_found')
    if (!items.every((i) => methodAllowed(i.channel as NoticeChannel, input.method))) {
      return err('method_not_allowed')
    }
    if (referenceRequired(input.method) && reference === '') return err('reference_required')
    const today = await townToday(tx, now, signal)
    if (compareCivil(input.effectiveOn, today) > 0) return err('future_date')
    const applicationIds = new Set(items.map((i) => i.applicationId))
    const [doc] = await tx
      .select({ id: documents.id, recordKind: documents.recordKind, recordId: documents.recordId })
      .from(documents)
      .where(eq(documents.id, input.documentId))
    const owners = [...applicationIds].filter((a): a is string => a !== null)
    const belongs =
      doc !== undefined &&
      doc.recordKind === 'application' &&
      (owners.length === 0 || owners.every((a) => a === doc.recordId))
    if (!belongs) return err('document_not_found')
    const live = await tx
      .select({ id: noticeProofs.id, itemId: noticeProofs.itemId })
      .from(noticeProofs)
      .where(
        and(
          inArray(noticeProofs.itemId, itemIds),
          notInArray(
            noticeProofs.id,
            sql`(select ${noticeProofSupersessions.proofId} from ${noticeProofSupersessions})`,
          ),
        ),
      )
    const proofIds: string[] = []
    for (const itemId of itemIds) {
      const [created] = await tx
        .insert(noticeProofs)
        .values({
          itemId,
          method: input.method,
          reference: reference === '' ? null : reference,
          effectiveOn: input.effectiveOn,
          documentId: input.documentId,
          recordedBy: actor.userId,
        })
        .returning({ id: noticeProofs.id })
      const proofId = created?.id ?? ''
      proofIds.push(proofId)
      for (const old of live.filter((p) => p.itemId === itemId)) {
        await tx
          .insert(noticeProofSupersessions)
          .values({ proofId: old.id, supersededByProofId: proofId })
      }
    }
    await writeAudit(
      tx,
      {
        actor: { kind: 'user', userId: actor.userId },
        action: 'notice.proof.record',
        entityType: 'notice_item',
        entityId: itemIds[0] ?? '',
        after: { itemIds, method: input.method, effectiveOn: input.effectiveOn },
      },
      signal,
    )
    return ok({ proofIds })
  })
}
