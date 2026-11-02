import { eq, sql } from 'drizzle-orm'
import { pgTable, uuid } from 'drizzle-orm/pg-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { geometryColumn } from '@/db/types/geometry'
import { makeTestDb, type TestDb } from '@/test/db'

const shapes = pgTable('throwaway_shapes', {
  id: uuid('id').primaryKey().defaultRandom(),
  geom: geometryColumn('geom', { type: 'MultiPolygon', srid: 4326 }),
})

const square: GeoJSON.MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [-71.5, 43.2],
        [-71.499, 43.2],
        [-71.499, 43.201],
        [-71.5, 43.201],
        [-71.5, 43.2],
      ],
    ],
  ],
}

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  await handle.db.execute(
    sql`CREATE TABLE throwaway_shapes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), geom geometry(MultiPolygon, 4326))`,
  )
  await handle.db.execute(
    sql`CREATE INDEX throwaway_shapes_geom_idx ON throwaway_shapes USING gist (geom)`,
  )
})
afterAll(async () => {
  await handle.drop()
})

describe('geometryColumn', () => {
  it('round trips a multipolygon through the column', async () => {
    const [row] = await handle.db.insert(shapes).values({ geom: square }).returning()
    const [read] = await handle.db
      .select()
      .from(shapes)
      .where(eq(shapes.id, row?.id ?? ''))
    expect(read?.geom?.type).toBe('MultiPolygon')
    expect((read?.geom as GeoJSON.MultiPolygon).coordinates).toEqual(square.coordinates)
  })

  it('gist index exists on the geometry column', async () => {
    const res = await handle.db.execute(
      sql`SELECT indexdef FROM pg_indexes WHERE tablename = 'throwaway_shapes' AND indexname = 'throwaway_shapes_geom_idx'`,
    )
    expect(String(res.rows[0]?.indexdef)).toContain('USING gist')
  })
})
