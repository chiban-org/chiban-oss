import { readFileSync } from 'node:fs'
import { NH_PARCEL_ID_FORMATS } from '@packs/nh/parcelIdFormats'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeTestDb, type TestDb } from '@/test/db'

const MIGRATION = new URL('../../../drizzle/0105_nh_parcel_id_formats.sql', import.meta.url)

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})
beforeEach(async () => {
  await handle.db.execute(sql`delete from parcel_aliases`)
  await handle.db.execute(sql`delete from parcel_id_formats`)
})

async function applyMigration(): Promise<void> {
  const statements = readFileSync(MIGRATION, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const statement of statements) await handle.db.execute(sql.raw(statement))
}

async function formats() {
  const r = await handle.db.execute<{
    key: string
    label: string
    kind: string
    width: number
    is_display: boolean
  }>(sql`select key, label, kind, width, is_display from parcel_id_formats order by key`)
  return r.rows
}

describe('NH parcel ID format defaults on a fresh install', () => {
  it('seeds the CAMA and GIS formats the pack declares, with the map-lot ID displayed', async () => {
    await applyMigration()
    expect(await formats()).toEqual(
      [...NH_PARCEL_ID_FORMATS]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((f) => ({
          key: f.key,
          label: f.label,
          kind: f.kind,
          width: f.width,
          is_display: f.isDisplay,
        })),
    )
  })

  it('declares examples that fit their own widths', () => {
    for (const f of NH_PARCEL_ID_FORMATS) {
      expect(f.example).toHaveLength(f.width)
      expect(f.example).toMatch(/^\d+$/)
    }
  })

  it('is idempotent', async () => {
    await applyMigration()
    const once = await formats()
    await applyMigration()
    expect(await formats()).toEqual(once)
  })

  it('leaves a display format the town already chose in place', async () => {
    await handle.db.execute(
      sql`insert into parcel_id_formats (key, label, kind, width, is_display)
        values ('town_pid', 'Town parcel ID', 'free_text', null, true)`,
    )
    await applyMigration()
    const rows = await formats()
    expect(rows.filter((r) => r.is_display).map((r) => r.key)).toEqual(['town_pid'])
    expect(rows.map((r) => r.key).sort()).toEqual(['cama15', 'gis12', 'town_pid'])
  })

  it('does not overwrite a format the town edited under the same key', async () => {
    await handle.db.execute(
      sql`insert into parcel_id_formats (key, label, kind, width, is_display)
        values ('gis12', 'Tax map and lot', 'digits', 12, false)`,
    )
    await applyMigration()
    const gis = (await formats()).find((r) => r.key === 'gis12')
    expect(gis).toMatchObject({ label: 'Tax map and lot', is_display: false })
  })
})
