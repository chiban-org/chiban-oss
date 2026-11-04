import { asc } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { associationRosters, parkRosters, restrictionHoldings } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { hasCapability } from '@/features/authz/capabilities'
import {
  type Contact,
  getRegionalContacts,
  type RegionalContactsBody,
} from '@/features/boards/regionalContacts'
import { displayIdsFor } from '@/features/parcels/displayId'
import { mayManageAbutters } from '@/features/rosters/manage'
import { officerLines, tenantLines } from '@/features/rosters/parseLines'
import type { RestrictionKind } from '@/features/rosters/restrictions'
import { type RosterKind, type RosterStatus, rosterStatus } from '@/features/rosters/reviews'
import { townToday } from '@/features/town/today'
import { formatCivilDate } from '@/lib/formatDate'

export interface RosterKindView {
  kind: RosterKind
  label: string
  statusText: string
}

export interface RostersView {
  today: string
  kinds: RosterKindView[]
  associations: {
    parcelId: string
    parcel: string
    name: string
    officers: string[]
    officersText: string
    asOf: string
    asOfText: string
  }[]
  parks: {
    parcelId: string
    parcel: string
    name: string
    owner: string
    ownerMailingAddress: string
    tenants: string[]
    tenantsText: string
    asOf: string
    asOfText: string
  }[]
  restrictions: {
    id: string
    parcelId: string
    parcel: string
    holder: string
    holderMailingAddress: string
    kind: RestrictionKind
    kindText: string
    reference: string
    endedText: string | null
  }[]
  regionalContacts: { role: string; lines: string[] }[]
  canEditRegionalContacts: boolean
}

const KIND_LABELS: Record<RosterKind, string> = {
  condo: 'Condominium association officers',
  park: 'Manufactured housing parks',
  restrictions: 'Easement and restriction holders',
  regional_contacts: 'Regional planning commission, municipalities, and NH DES contacts',
}

export const RESTRICTION_LABELS = {
  conservation: 'Conservation easement',
  preservation: 'Preservation easement',
  agricultural_preservation: 'Agricultural preservation restriction',
} as const

function contactLines(contacts: RegionalContactsBody): { role: string; lines: string[] }[] {
  const line = (c: Contact) => `${c.name}, ${c.mailingAddress}`
  return [
    {
      role: 'Regional planning commission',
      lines: contacts.commission === null ? [] : [line(contacts.commission)],
    },
    { role: 'Affected municipalities', lines: contacts.municipalities.map(line) },
    { role: 'NH DES', lines: contacts.nhDes === null ? [] : [line(contacts.nhDes)] },
  ]
}

function ageText(age: number): string {
  if (age === 0) return 'today'
  return `${age} ${age === 1 ? 'day' : 'days'} ago`
}

export function rosterStatusText(status: RosterStatus): string {
  if (status.state === 'never_reviewed') return 'Never reviewed'
  return `Reviewed ${formatCivilDate(status.reviewedOn ?? '')}, ${ageText(status.ageDays ?? 0)}`
}

export async function loadRostersView(
  db: Db,
  actor: Actor,
  signal: AbortSignal,
): Promise<RostersView | null> {
  signal.throwIfAborted()
  if (!(await mayManageAbutters(db, actor.userId, signal))) return null
  const today = await townToday(db, new Date(), signal)
  const kinds: RosterKindView[] = []
  for (const kind of ['condo', 'park', 'restrictions', 'regional_contacts'] as const) {
    kinds.push({
      kind,
      label: KIND_LABELS[kind],
      statusText: rosterStatusText(await rosterStatus(db, kind, today, signal)),
    })
  }
  const associations = await db
    .select()
    .from(associationRosters)
    .orderBy(asc(associationRosters.associationName))
  const parks = await db.select().from(parkRosters).orderBy(asc(parkRosters.parkName))
  const holdings = await db
    .select()
    .from(restrictionHoldings)
    .orderBy(asc(restrictionHoldings.holderName))
  const labels = await displayIdsFor(db, [
    ...associations.map((a) => a.parcelId),
    ...parks.map((p) => p.parcelId),
    ...holdings.map((h) => h.parcelId),
  ])
  const label = (id: string) => labels.get(id) ?? 'Parcel'
  return {
    today,
    kinds,
    associations: associations.map((a) => ({
      parcelId: a.parcelId,
      parcel: label(a.parcelId),
      name: a.associationName,
      officers: a.officers.map((o) => `${o.name}, ${o.title}`),
      officersText: officerLines(a.officers),
      asOf: a.asOf,
      asOfText: formatCivilDate(a.asOf),
    })),
    parks: parks.map((p) => ({
      parcelId: p.parcelId,
      parcel: label(p.parcelId),
      name: p.parkName,
      owner: p.ownerName,
      ownerMailingAddress: p.ownerMailingAddress,
      tenants: p.tenants.map((t) => `${t.name}, ${t.siteLabel}`),
      tenantsText: tenantLines(p.tenants),
      asOf: p.asOf,
      asOfText: formatCivilDate(p.asOf),
    })),
    restrictions: holdings.map((h) => ({
      id: h.id,
      parcelId: h.parcelId,
      parcel: label(h.parcelId),
      holder: h.holderName,
      holderMailingAddress: h.holderMailingAddress,
      kind: h.restrictionKind,
      kindText: RESTRICTION_LABELS[h.restrictionKind],
      reference: h.recordedReference,
      endedText: h.endedOn === null ? null : formatCivilDate(h.endedOn),
    })),
    regionalContacts: contactLines(await getRegionalContacts(db, signal)),
    canEditRegionalContacts: await hasCapability(db, actor.userId, 'config.edit', signal),
  }
}
