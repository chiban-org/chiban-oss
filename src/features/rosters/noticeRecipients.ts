import { and, eq, gt, isNull, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { associationRosters, parkRosters, restrictionHoldings } from '@/db/schema'
import type { CivilDate } from '@/types/civilDate'

export interface NoticeRecipients {
  associations: string[]
  parks: { name: string; owner: string }[]
  holders: string[]
}

export async function loadNoticeRecipients(
  db: DbOrTx,
  input: { parcelId: string; today: CivilDate },
  signal: AbortSignal,
): Promise<NoticeRecipients> {
  signal.throwIfAborted()
  const { parcelId, today } = input
  const associations = await db
    .select({ name: associationRosters.associationName })
    .from(associationRosters)
    .where(
      and(
        eq(associationRosters.parcelId, parcelId),
        or(isNull(associationRosters.endedOn), gt(associationRosters.endedOn, today)),
      ),
    )
  const parks = await db
    .select({ name: parkRosters.parkName, owner: parkRosters.ownerName })
    .from(parkRosters)
    .where(
      and(
        eq(parkRosters.parcelId, parcelId),
        or(isNull(parkRosters.endedOn), gt(parkRosters.endedOn, today)),
      ),
    )
  const holders = await db
    .select({ name: restrictionHoldings.holderName })
    .from(restrictionHoldings)
    .where(
      and(
        eq(restrictionHoldings.parcelId, parcelId),
        or(isNull(restrictionHoldings.endedOn), gt(restrictionHoldings.endedOn, today)),
      ),
    )
    .orderBy(restrictionHoldings.holderName)
  return {
    associations: associations.map((a) => a.name),
    parks,
    holders: holders.map((h) => h.name),
  }
}

export function noticeRecipientsText(recipients: NoticeRecipients): string[] {
  const owners =
    recipients.associations.length + recipients.parks.length === 0 ? ['Owner of record'] : []
  return [
    ...owners,
    ...recipients.associations.map((name) => `${name} officers`),
    ...recipients.parks.map((p) => `${p.name}, park owner ${p.owner} and tenants`),
    ...recipients.holders.map((name) => `${name}, restriction holder`),
  ]
}
