import { inArray } from 'drizzle-orm'
import type { Tx } from '@/db/client'
import { parcels } from '@/db/schema'
import { applicantRecipient } from '@/features/abutters/applicantRecipient'
import { loadRecipientBasis, makeRecipient } from '@/features/abutters/recipientBasis'
import type { Recipient, ResolverInput } from '@/features/abutters/resolution'
import type { IncompleteReason } from '@/features/abutters/types'

function blank(text: string | null): boolean {
  return text === null || text.trim() === ''
}

export async function resolveOwners(
  tx: Tx,
  input: ResolverInput,
  incomplete: IncompleteReason[],
  signal: AbortSignal,
): Promise<Recipient[]> {
  signal.throwIfAborted()
  const ids = input.candidates.map((c) => c.parcelId)
  if (ids.length === 0) return []
  const rows = await tx
    .select({ id: parcels.id, owner: parcels.ownerName, address: parcels.mailingAddress })
    .from(parcels)
    .where(inArray(parcels.id, ids))
  const byId = new Map(rows.map((r) => [r.id, r]))
  const { parcelProvenance } = await loadRecipientBasis(tx, input.now, signal)
  return ids.flatMap((id) => {
    const row = byId.get(id)
    if (row === undefined) return []
    if (blank(row.owner)) {
      incomplete.push({
        code: 'owner_missing',
        detail: 'The parcel record has no owner name.',
        parcelId: id,
      })
    } else if (blank(row.address)) {
      incomplete.push({
        code: 'address_missing',
        detail: `The parcel record has no mailing address for ${row.owner ?? ''}.`,
        parcelId: id,
      })
    }
    return [
      makeRecipient(row.owner, row.address, {
        roles: ['abutter_owner'],
        parcelIds: [id],
        provenance: [parcelProvenance(id)],
      }),
    ]
  })
}

export async function resolveApplicant(
  tx: Tx,
  input: ResolverInput,
  incomplete: IncompleteReason[],
  signal: AbortSignal,
): Promise<Recipient[]> {
  signal.throwIfAborted()
  return [await applicantRecipient(tx, input.applicationId, incomplete)]
}
