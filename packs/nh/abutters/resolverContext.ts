import type { Tx } from '@/db/client'
import { allLayerStatuses } from '@/features/abutters/layerUse'
import type { Provenance, Recipient, ResolverInput } from '@/features/abutters/resolution'
import type { IncompleteReason } from '@/features/abutters/types'
import { isDue, lastChecked, recheckDays } from '@/features/rosters/recheck'
import { getTownSettings } from '@/features/town/settings'
import { type CivilDate, daysBetween, todayInTimeZone } from '@/types/civilDate'

const FALLBACK_TIME_ZONE = 'UTC'

export interface Context {
  tx: Tx
  input: ResolverInput
  today: CivilDate
  recheckDays: number
  parcelProvenance: (parcelId: string) => Provenance
  recipients: Recipient[]
  incomplete: IncompleteReason[]
}

type RecipientParts = Pick<Recipient, 'roles' | 'parcelIds' | 'provenance'> &
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

export function rosterProvenance(
  source: Provenance['source'],
  ref: string,
  asOf: string | null,
  today: CivilDate,
  state: Provenance['state'],
): Provenance {
  return {
    source,
    ref,
    asOf,
    ageDays: asOf === null ? null : daysBetween(asOf as CivilDate, today),
    state,
  }
}

export function checkedProvenance(
  ctx: Context,
  source: 'association_roster' | 'park_roster',
  roster: { id: string; asOf: string; checkedOn: string | null },
): Provenance {
  const checked = lastChecked(roster.asOf, roster.checkedOn)
  const stale = isDue(checked, ctx.today, ctx.recheckDays)
  return {
    ...rosterProvenance(source, roster.id, roster.asOf, ctx.today, stale ? 'stale' : 'fresh'),
    ...(checked === null || checked === roster.asOf ? {} : { checkedOn: checked }),
  }
}

export async function buildContext(
  tx: Tx,
  input: ResolverInput,
  signal: AbortSignal,
): Promise<Context> {
  const town = await getTownSettings(tx, signal)
  const timeZone = town.ok ? town.value.timeZone : FALLBACK_TIME_ZONE
  const today = todayInTimeZone(timeZone, input.now)
  const parcelLayer = (await allLayerStatuses(tx, input.now, signal)).parcels
  const asOf =
    parcelLayer.lastSuccessAt === null
      ? null
      : todayInTimeZone(timeZone, new Date(parcelLayer.lastSuccessAt))
  return {
    tx,
    input,
    today,
    recheckDays: await recheckDays(tx, signal),
    recipients: [],
    incomplete: [],
    parcelProvenance: (parcelId) => ({
      source: 'parcel_record',
      ref: parcelId,
      asOf,
      ageDays: parcelLayer.ageDays,
      state: parcelLayer.state === 'stale' ? 'stale' : 'fresh',
    }),
  }
}
