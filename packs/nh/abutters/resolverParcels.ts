import { type Context, checkedProvenance, makeRecipient } from './resolverContext'
import { loadAssociations, loadParcelFacts, loadParks } from './resolverSources'

function pushOwner(
  ctx: Context,
  parcelId: string,
  owner: string | null,
  address: string | null,
): void {
  ctx.recipients.push(
    makeRecipient(owner, address, {
      roles: ['abutter_owner'],
      parcelIds: [parcelId],
      provenance: [ctx.parcelProvenance(parcelId)],
    }),
  )
  if (owner === null || owner.trim() === '') {
    ctx.incomplete.push({
      code: 'owner_missing',
      detail: 'The parcel record has no owner name.',
      parcelId,
    })
  } else if (address === null || address.trim() === '') {
    ctx.incomplete.push({
      code: 'address_missing',
      detail: `The parcel record has no mailing address for ${owner}.`,
      parcelId,
    })
  }
}

export async function resolveParcels(ctx: Context): Promise<void> {
  const ids = ctx.input.candidates.map((c) => c.parcelId)
  const facts = await loadParcelFacts(ctx.tx, ids)
  const associations = await loadAssociations(ctx.tx, ids, ctx.today)
  const parks = await loadParks(ctx.tx, ids, ctx.today)
  for (const id of ids) {
    const parcel = facts.get(id)
    if (parcel === undefined) continue
    const association = associations.get(id)
    const park = parks.get(id)
    if (association !== undefined) {
      const provenance = checkedProvenance(ctx, 'association_roster', association)
      for (const officer of association.officers) {
        ctx.recipients.push(
          makeRecipient(officer.name, officer.mailingAddress, {
            roles: ['condo_association_officer'],
            parcelIds: [id],
            provenance: [provenance],
          }),
        )
      }
    } else if (park !== undefined) {
      const provenance = checkedProvenance(ctx, 'park_roster', park)
      ctx.recipients.push(
        makeRecipient(park.ownerName, park.ownerMailingAddress, {
          roles: ['mhp_owner'],
          parcelIds: [id],
          provenance: [provenance],
        }),
      )
      for (const tenant of park.tenants) {
        ctx.recipients.push(
          makeRecipient(tenant.name, tenant.mailingAddress, {
            roles: ['mhp_tenant'],
            parcelIds: [id],
            provenance: [{ ...provenance, ref: `${park.id}:${tenant.tenantId}` }],
            status: 'needs_decision',
          }),
        )
      }
    } else if (parcel.unitCount > 1) {
      ctx.incomplete.push({
        code: 'condo_roster_missing',
        detail: 'This parcel is a condominium with no association officer roster on file.',
        parcelId: id,
      })
    } else {
      pushOwner(ctx, id, parcel.ownerName, parcel.mailingAddress)
    }
  }
}
