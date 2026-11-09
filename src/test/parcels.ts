import { NH_PARCEL_ID_FORMATS } from '@packs/nh/parcelIdFormats'
import { AppError, ErrorIds } from '@/constants/errorIds'
import type { Role } from '@/constants/roles'
import type { Db, DbOrTx } from '@/db/client'
import { parcelAliases, parcelIdFormats, parcels, townSettings } from '@/db/schema'
import { type Actor, loadActor } from '@/features/auth/actor'
import { seedDefaultGrants } from '@/features/authz/defaultGrants'
import { normalizeId } from '@/features/parcels/idFormats'
import { makeUser } from '@/test/factories'

export async function seedFormats(db: DbOrTx): Promise<void> {
  await db
    .insert(parcelIdFormats)
    .values(NH_PARCEL_ID_FORMATS.map(({ example: _example, ...format }) => format))
    .onConflictDoNothing()
}

export interface TestAlias {
  format: string
  value: string
  status?: 'active' | 'retired'
}

export async function makeParcel(
  db: Db | DbOrTx,
  aliases: TestAlias[],
  extra: Partial<typeof parcels.$inferInsert> = {},
): Promise<string> {
  const [row] = await db.insert(parcels).values(extra).returning({ id: parcels.id })
  const id = row?.id ?? ''
  if (aliases.length > 0) {
    await db.insert(parcelAliases).values(
      aliases.map((a) => ({
        parcelId: id,
        format: a.format,
        value: a.value,
        valueNormalized: normalizeId(a.value),
        status: a.status ?? 'active',
        source: 'import' as const,
      })),
    )
  }
  return id
}

export async function seedTown(db: DbOrTx): Promise<void> {
  await db
    .insert(townSettings)
    .values({ id: 1, name: 'Town of Alder Pond', stateCode: 'NH', timeZone: 'America/New_York' })
    .onConflictDoNothing()
}

export async function staffActor(db: Db, role: Role = 'staff'): Promise<Actor> {
  const userId = await makeUser(db, { role })
  const actor = await loadActor(db, userId, new AbortController().signal)
  if (actor === null) throw new AppError(ErrorIds.DB_INVARIANT, 'actor not loadable')
  return actor
}

export async function seedParcelWorld(db: Db): Promise<void> {
  await seedFormats(db)
  await seedTown(db)
  await seedDefaultGrants(db, new AbortController().signal)
}
