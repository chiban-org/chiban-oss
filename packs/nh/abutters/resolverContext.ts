import type { Tx } from '@/db/client'
import { loadRecipientBasis } from '@/features/abutters/recipientBasis'
import type { Provenance, Recipient, ResolverInput } from '@/features/abutters/resolution'
import type { IncompleteReason } from '@/features/abutters/types'
import { isDue, lastChecked, recheckDays } from '@/features/rosters/recheck'
import { type CivilDate, daysBetween } from '@/types/civilDate'

export interface Context {
  tx: Tx
  input: ResolverInput
  today: CivilDate
  recheckDays: number
  parcelProvenance: (parcelId: string) => Provenance
  recipients: Recipient[]
  incomplete: IncompleteReason[]
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
  const basis = await loadRecipientBasis(tx, input.now, signal)
  return {
    tx,
    input,
    today: basis.today,
    recheckDays: await recheckDays(tx, signal),
    recipients: [],
    incomplete: [],
    parcelProvenance: basis.parcelProvenance,
  }
}
