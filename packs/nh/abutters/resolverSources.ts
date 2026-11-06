import { and, asc, eq, gt, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
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
import { formApplicantName, namedParty } from '@/features/applications/applicantName'
import type { CivilDate } from '@/types/civilDate'

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

function inForce(endedOn: PgColumn, today: CivilDate): SQL | undefined {
  return or(isNull(endedOn), gt(endedOn, today))
}

export async function loadAssociations(db: DbOrTx, parcelIds: string[], today: CivilDate) {
  if (parcelIds.length === 0) return new Map<string, typeof associationRosters.$inferSelect>()
  const rows = await db
    .select()
    .from(associationRosters)
    .where(
      and(
        inArray(associationRosters.parcelId, parcelIds),
        inForce(associationRosters.endedOn, today),
      ),
    )
    .orderBy(sql`${associationRosters.endedOn} is null`)
  return new Map(rows.map((r) => [r.parcelId, r]))
}

export async function loadParks(db: DbOrTx, parcelIds: string[], today: CivilDate) {
  if (parcelIds.length === 0) return new Map<string, typeof parkRosters.$inferSelect>()
  const rows = await db
    .select()
    .from(parkRosters)
    .where(and(inArray(parkRosters.parcelId, parcelIds), inForce(parkRosters.endedOn, today)))
    .orderBy(sql`${parkRosters.endedOn} is null`)
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
  const fromForm = formApplicantName(await applicationValues(db, applicationId))
  if (row === undefined) return { name: fromForm, ref: applicationId }
  return { name: fromForm ?? namedParty(row.name) ?? row.displayName ?? null, ref: row.partyId }
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
