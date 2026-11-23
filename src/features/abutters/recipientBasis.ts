import type { Tx } from '@/db/client'
import { allLayerStatuses } from '@/features/abutters/layerUse'
import type { Provenance, Recipient } from '@/features/abutters/resolution'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, todayInTimeZone } from '@/types/civilDate'

const FALLBACK_TIME_ZONE = 'UTC'

export type RecipientParts = Pick<Recipient, 'roles' | 'parcelIds' | 'provenance'> &
  Partial<Pick<Recipient, 'channelHint' | 'status'>>

export function makeRecipient(
  name: string | null,
  address: string | null,
  parts: RecipientParts,
): Recipient {
  const cleanName = name?.trim() ?? ''
  const cleanAddress = address?.trim() ?? ''
  const complete = cleanName !== '' && cleanAddress !== ''
  return {
    key: '',
    name: cleanName,
    mailingAddress: cleanAddress === '' ? null : cleanAddress,
    channelHint: parts.channelHint ?? 'verified_mail',
    status: parts.status ?? (complete ? 'ok' : 'incomplete_data'),
    roles: parts.roles,
    parcelIds: parts.parcelIds,
    provenance: parts.provenance,
  }
}

export interface RecipientBasis {
  today: CivilDate
  parcelProvenance: (parcelId: string) => Provenance
}

export async function loadRecipientBasis(
  tx: Tx,
  now: Date,
  signal: AbortSignal,
): Promise<RecipientBasis> {
  const town = await getTownSettings(tx, signal)
  const timeZone = town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE
  const today = todayInTimeZone(timeZone, now)
  const parcelLayer = (await allLayerStatuses(tx, now, signal)).parcels
  const asOf =
    parcelLayer.lastSuccessAt === null
      ? null
      : todayInTimeZone(timeZone, new Date(parcelLayer.lastSuccessAt))
  return {
    today,
    parcelProvenance: (parcelId) => ({
      source: 'parcel_record',
      ref: parcelId,
      asOf,
      ageDays: parcelLayer.ageDays,
      state: parcelLayer.state === 'stale' ? 'stale' : 'fresh',
    }),
  }
}
