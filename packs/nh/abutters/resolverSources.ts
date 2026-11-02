import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  applications,
  associationRosters,
  parcels,
  parkRosters,
  projectParties,
  projects,
  users,
} from '@/db/schema'
import { uuidArray } from '@/db/uuidList'

export interface ParcelFacts {
  id: string
  ownerName: string | null
  mailingAddress: string | null
  unitCount: number
}

export async function loadParcelFacts(
  db: DbOrTx,
  parcelIds: string[],
): Promise<Map<string, ParcelFacts>> {
  if (parcelIds.length === 0) return new Map()
  const rows = await db
    .select({
      id: parcels.id,
      ownerName: parcels.ownerName,
      mailingAddress: parcels.mailingAddress,
    })
    .from(parcels)
    .where(inArray(parcels.id, parcelIds))
  const counts = await db.execute<{ parcel_id: string; n: number }>(sql`
    select parcel_id, count(*)::int as n
    from parcel_aliases
    where parcel_id = any(${uuidArray(parcelIds)}) and format = 'cama15' and status = 'active'
    group by parcel_id
  `)
  const byParcel = new Map(counts.rows.map((r) => [r.parcel_id, r.n]))
  return new Map(rows.map((r) => [r.id, { ...r, unitCount: byParcel.get(r.id) ?? 0 }]))
}

export async function loadAssociations(db: DbOrTx, parcelIds: string[]) {
  if (parcelIds.length === 0) return new Map<string, typeof associationRosters.$inferSelect>()
  const rows = await db
    .select()
    .from(associationRosters)
    .where(inArray(associationRosters.parcelId, parcelIds))
  return new Map(rows.map((r) => [r.parcelId, r]))
}

export async function loadParks(db: DbOrTx, parcelIds: string[]) {
  if (parcelIds.length === 0) return new Map<string, typeof parkRosters.$inferSelect>()
  const rows = await db.select().from(parkRosters).where(inArray(parkRosters.parcelId, parcelIds))
  return new Map(rows.map((r) => [r.parcelId, r]))
}

export async function applicantParty(
  db: DbOrTx,
  applicationId: string,
): Promise<{ name: string | null; ref: string }> {
  const [row] = await db
    .select({
      partyId: projectParties.id,
      name: projectParties.name,
      displayName: users.displayName,
    })
    .from(applications)
    .innerJoin(projects, eq(projects.id, applications.projectId))
    .innerJoin(projectParties, eq(projectParties.projectId, projects.id))
    .leftJoin(users, eq(users.id, projectParties.userId))
    .where(
      and(
        eq(applications.id, applicationId),
        eq(projectParties.role, 'applicant'),
        sql`${projectParties.removedAt} is null`,
      ),
    )
    .orderBy(asc(projectParties.addedAt))
    .limit(1)
  if (row === undefined) return { name: null, ref: applicationId }
  const generic = row.name.trim() === '' || row.name === 'Applicant'
  return { name: generic ? (row.displayName ?? null) : row.name, ref: row.partyId }
}

export async function applicationValues(
  db: DbOrTx,
  applicationId: string,
): Promise<Record<string, unknown>> {
  const [row] = await db
    .select({ values: applications.values })
    .from(applications)
    .where(eq(applications.id, applicationId))
  return (row?.values ?? {}) as Record<string, unknown>
}
