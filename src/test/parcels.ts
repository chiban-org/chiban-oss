import type { Db, DbOrTx } from '@/db/client'
import { parcelAliases, parcelIdFormats, parcels } from '@/db/schema'
import { normalizeId } from '@/features/parcels/idFormats'

export async function seedFormats(db: DbOrTx): Promise<void> {
  await db
    .insert(parcelIdFormats)
    .values([
      { key: 'cama15', label: 'CAMA number', kind: 'digits', width: 15 },
      { key: 'gis12', label: 'Map-lot ID', kind: 'digits', width: 12, isDisplay: true },
    ])
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
