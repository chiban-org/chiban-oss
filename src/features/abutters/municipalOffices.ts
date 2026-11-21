import { asc, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { applicationMunicipalities, sourceWaterDeterminations } from '@/db/schema'
import type { Provenance, Recipient } from '@/features/abutters/resolution'
import type { RecipientRole } from '@/features/abutters/roles'
import type { IncompleteReason } from '@/features/abutters/types'
import { getRegionalContacts } from '@/features/boards/regionalContacts'

export interface ResolverContext {
  tx: DbOrTx
  input: { applicationId: string }
  signal: AbortSignal
  incomplete: IncompleteReason[]
}

function contactRecipient(
  role: RecipientRole,
  contact: { name: string; mailingAddress: string },
  ref: string,
): Recipient {
  const provenance: Provenance = {
    source: 'regional_contacts',
    ref,
    asOf: null,
    ageDays: null,
    state: 'entered',
  }
  return {
    key: '',
    roles: [role],
    name: contact.name.trim(),
    mailingAddress: contact.mailingAddress.trim(),
    parcelIds: [],
    channelHint: 'first_class_mail',
    status: 'ok',
    provenance: [provenance],
  }
}

export async function resolveMunicipalOffices(ctx: ResolverContext): Promise<Recipient[]> {
  const listed = await ctx.tx
    .select()
    .from(applicationMunicipalities)
    .where(eq(applicationMunicipalities.applicationId, ctx.input.applicationId))
    .orderBy(asc(applicationMunicipalities.municipalityKey))
  if (listed.length === 0) return []
  const contacts = await getRegionalContacts(ctx.tx, ctx.signal)
  const out: Recipient[] = []
  for (const { municipalityKey } of listed) {
    const municipality = contacts.municipalities.find((m) => m.key === municipalityKey)
    const offices = [
      { role: 'municipal_clerk', label: 'clerk', contact: municipality?.clerk },
      {
        role: 'municipal_reviewing_authority',
        label: 'reviewing authority',
        contact: municipality?.reviewingAuthority,
      },
    ] as const
    for (const { role, label, contact } of offices) {
      if (contact === undefined) {
        ctx.incomplete.push({
          code: 'regional_contacts_missing',
          detail: `The ${label} of ${municipalityKey} has no mailing address on file.`,
          role,
        })
        continue
      }
      out.push(contactRecipient(role, contact, municipalityKey))
    }
  }
  return out
}

export async function resolveWaterSupplier(ctx: ResolverContext): Promise<Recipient[]> {
  const [determination] = await ctx.tx
    .select()
    .from(sourceWaterDeterminations)
    .where(eq(sourceWaterDeterminations.applicationId, ctx.input.applicationId))
  if (determination === undefined) {
    ctx.incomplete.push({
      code: 'determination_missing',
      detail: 'The source water protection area determination has not been recorded.',
      role: 'water_supplier',
    })
    return []
  }
  if (determination.determination !== 'within') return []
  const contacts = await getRegionalContacts(ctx.tx, ctx.signal)
  const supplier = contacts.waterSuppliers.find((s) => s.key === determination.supplierKey)
  if (supplier === undefined) {
    ctx.incomplete.push({
      code: 'regional_contacts_missing',
      detail: `The water supplier ${determination.supplierKey ?? ''} has no mailing address on file.`,
      role: 'water_supplier',
    })
    return []
  }
  return [contactRecipient('water_supplier', supplier, supplier.key)]
}
