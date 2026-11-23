import { eq, sql } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parcelIdFormats } from '@/db/schema'
import { setActivePackForTest } from '@/features/packs/registry'
import { syncPackParcelIdFormats } from '@/features/parcels/syncPackFormats'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer } from '@/test/gisFixtures'
import { xxPackWith } from '@/test/packs/xx/variants'
import { makeParcel, seedParcelWorld } from '@/test/parcels'

const signal = new AbortController().signal
let handle: TestDb

const XX_FORMAT = {
  key: 'xx_map_lot',
  label: 'Map-lot',
  kind: 'digits' as const,
  width: 10,
  isDisplay: true,
  example: '0010020000',
}
const XX_PACK = xxPackWith({ pack: { parcelIdFormats: [XX_FORMAT] } })
const FREE_TEXT_PACK = xxPackWith({
  pack: {
    parcelIdFormats: [
      {
        key: 'map_lot',
        label: 'Map and lot',
        kind: 'free_text' as const,
        width: null,
        isDisplay: true,
        example: 'R04-012',
      },
    ],
  },
})

beforeEach(async () => {
  handle = await makeTestDb()
  await seedParcelWorld(handle.db)
})
afterEach(async () => {
  setActivePackForTest(null)
  await handle.drop()
})
afterAll(() => {
  setActivePackForTest(null)
})

async function formatKeys(): Promise<string[]> {
  const rows = await handle.db.select().from(parcelIdFormats)
  return rows.map((r) => r.key).sort()
}

async function displayKeys(): Promise<string[]> {
  const rows = await handle.db
    .select()
    .from(parcelIdFormats)
    .where(eq(parcelIdFormats.isDisplay, true))
  return rows.map((r) => r.key)
}

describe('syncPackParcelIdFormats', () => {
  it('is a no-op on an NH database', async () => {
    const before = await formatKeys()
    expect(await syncPackParcelIdFormats(handle.db, signal)).toEqual({ inserted: [], removed: [] })
    expect(await formatKeys()).toEqual(before)
  })

  it('does not bring back an NH format an admin deleted', async () => {
    await handle.db.delete(parcelIdFormats).where(eq(parcelIdFormats.key, 'cama15'))
    expect(await formatKeys()).toEqual(['gis12'])
    expect(await syncPackParcelIdFormats(handle.db, signal)).toEqual({ inserted: [], removed: [] })
    expect(await formatKeys()).toEqual(['gis12'])
  })

  it('leaves a customised NH display format alone', async () => {
    await handle.db.execute(sql`update parcel_id_formats set is_display = false`)
    await handle.db.insert(parcelIdFormats).values({
      key: 'town_pid',
      label: 'Town parcel ID',
      kind: 'free_text',
      width: null,
      isDisplay: true,
    })
    await syncPackParcelIdFormats(handle.db, signal)
    expect(await displayKeys()).toEqual(['town_pid'])
  })

  it('installs the pack formats on a fresh database for another pack', async () => {
    setActivePackForTest(XX_PACK)
    const result = await syncPackParcelIdFormats(handle.db, signal)
    expect(result.inserted).toEqual(['xx_map_lot'])
    expect([...result.removed].sort()).toEqual(['cama15', 'gis12'])
    expect(await formatKeys()).toEqual(['xx_map_lot'])
    expect(await displayKeys()).toEqual(['xx_map_lot'])
  })

  it('installs a free-text pack format with no width as the display format', async () => {
    setActivePackForTest(FREE_TEXT_PACK)
    const result = await syncPackParcelIdFormats(handle.db, signal)
    expect(result.inserted).toEqual(['map_lot'])
    const rows = await handle.db.select().from(parcelIdFormats)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: 'map_lot',
      kind: 'free_text',
      width: null,
      isDisplay: true,
    })
  })

  it('keeps an NH format that parcels already use', async () => {
    await makeParcel(handle.db, [{ format: 'gis12', value: '001002000000' }])
    setActivePackForTest(XX_PACK)
    const result = await syncPackParcelIdFormats(handle.db, signal)
    expect(result.removed).toEqual(['cama15'])
    expect(await formatKeys()).toEqual(['gis12', 'xx_map_lot'])
    expect(await displayKeys()).toEqual(['gis12'])
  })

  it('keeps an NH format that a saved GIS mapping names', async () => {
    await configureLayer(handle.db, 'parcels', {
      primaryId: { field: 'MAPLOT', format: 'gis12', padNumeric: false },
    })
    setActivePackForTest(XX_PACK)
    const result = await syncPackParcelIdFormats(handle.db, signal)
    expect(result.removed).toEqual(['cama15'])
    expect(await formatKeys()).toEqual(['gis12', 'xx_map_lot'])
  })

  it('is idempotent', async () => {
    setActivePackForTest(XX_PACK)
    await syncPackParcelIdFormats(handle.db, signal)
    expect(await syncPackParcelIdFormats(handle.db, signal)).toEqual({ inserted: [], removed: [] })
  })
})
