import { asc, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { noticeItems, noticeProofSupersessions, noticeProofs, noticeSets } from '@/db/schema'
import { noticeCostSummary } from '@/features/abutters/noticeCosts'
import { type CivilDate, compareCivil } from '@/types/civilDate'

export type ItemState = 'proved_on_time' | 'proved_late' | 'missing'

export interface NoticeStatusItem {
  itemId: string
  requirementKey: string
  channel: string
  recipientName: string | null
  recipientAddress: string | null
  source: 'pack_rule' | 'town_setting'
  dueOn: CivilDate
  proof: {
    proofId: string
    method: string
    reference: string | null
    effectiveOn: CivilDate
    documentId: string
  } | null
  state: ItemState
}

export interface NoticeStatus {
  items: NoticeStatusItem[]
  properlyNoticed: boolean
  noticeCostsDueCents: number
}

export async function noticeStatus(
  db: DbOrTx,
  setId: string,
  signal: AbortSignal,
): Promise<NoticeStatus> {
  signal.throwIfAborted()
  const [own] = await db
    .select({ applicationId: noticeSets.applicationId, inheritedFrom: noticeSets.inheritedFrom })
    .from(noticeSets)
    .where(eq(noticeSets.id, setId))
  if (own?.inheritedFrom != null) return await noticeStatus(db, own.inheritedFrom, signal)
  const rows = await db
    .select({ item: noticeItems, proof: noticeProofs })
    .from(noticeItems)
    .leftJoin(
      noticeProofs,
      sql`${noticeProofs.itemId} = ${noticeItems.id} and ${noticeProofs.id} not in (select ${noticeProofSupersessions.proofId} from ${noticeProofSupersessions})`,
    )
    .where(eq(noticeItems.setId, setId))
    .orderBy(asc(noticeItems.requirementKey), asc(noticeItems.recipientName), asc(noticeItems.id))
  const items = rows.map(({ item, proof }): NoticeStatusItem => {
    const dueOn = item.dueOn as CivilDate
    const effectiveOn = proof === null ? null : (proof.effectiveOn as CivilDate)
    const state =
      effectiveOn === null
        ? 'missing'
        : compareCivil(effectiveOn, dueOn) <= 0
          ? 'proved_on_time'
          : 'proved_late'
    return {
      itemId: item.id,
      requirementKey: item.requirementKey,
      channel: item.channel,
      recipientName: item.recipientName,
      recipientAddress: item.recipientAddress,
      source: item.source,
      dueOn,
      proof:
        proof === null
          ? null
          : {
              proofId: proof.id,
              method: proof.method,
              reference: proof.reference,
              effectiveOn: proof.effectiveOn as CivilDate,
              documentId: proof.documentId,
            },
      state,
    }
  })
  const costs =
    own?.applicationId == null
      ? 0
      : (await noticeCostSummary(db, own.applicationId, signal)).dueCents
  return {
    items,
    properlyNoticed: items.length > 0 && items.every((i) => i.state === 'proved_on_time'),
    noticeCostsDueCents: costs,
  }
}
