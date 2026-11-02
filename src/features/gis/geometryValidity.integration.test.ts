import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkAnyGeometry, checkGeometry } from '@/features/gis/geometryValidity'
import { makeTestDb, type TestDb } from '@/test/db'

const signal = new AbortController().signal
let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
})
afterAll(async () => {
  await handle.drop()
})

const ring = [
  [-71.5, 43.2],
  [-71.499, 43.2],
  [-71.499, 43.201],
  [-71.5, 43.201],
  [-71.5, 43.2],
]

describe('checkGeometry', () => {
  it('bowtie polygon is invalid with a reason', async () => {
    const bowtie: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-71.5, 43.2],
          [-71.499, 43.201],
          [-71.499, 43.2],
          [-71.5, 43.201],
          [-71.5, 43.2],
        ],
      ],
    }
    const r = await checkGeometry(handle.db, bowtie, signal)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.reason).toMatch(/Self-intersection/)
  })

  it('polygon is promoted to multipolygon', async () => {
    const r = await checkGeometry(handle.db, { type: 'Polygon', coordinates: [ring] }, signal)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.type).toBe('MultiPolygon')
  })

  it('a point is rejected as unsupported', async () => {
    const r = await checkGeometry(handle.db, { type: 'Point', coordinates: [-71.5, 43.2] }, signal)
    expect(r.ok).toBe(false)
  })
  it('an empty polygon is invalid rather than silently valid', async () => {
    const r = await checkGeometry(handle.db, { type: 'Polygon', coordinates: [] }, signal)
    expect(r.ok).toBe(false)
  })

  it('a longitude or latitude out of range is invalid', async () => {
    const far = ring.map(([x, y]) => [(x ?? 0) + 300, y ?? 0])
    const lon = await checkGeometry(handle.db, { type: 'Polygon', coordinates: [far] }, signal)
    const tall = ring.map(([x, y]) => [x ?? 0, (y ?? 0) + 60])
    const lat = await checkGeometry(handle.db, { type: 'Polygon', coordinates: [tall] }, signal)
    expect(lon.ok).toBe(false)
    expect(lat.ok).toBe(false)
  })

  it.each([
    ['text coordinates', [[['a', 'b']]]],
    [
      'a ring with too few points',
      [
        [
          [-71.5, 43.2],
          [-71.4, 43.2],
        ],
      ],
    ],
    [
      'an unclosed ring',
      [
        [
          [-71.5, 43.2],
          [-71.4, 43.2],
          [-71.4, 43.3],
          [-71.3, 43.3],
        ],
      ],
    ],
    ['a missing nesting level', [-71.5, 43.2]],
  ])('malformed coordinates (%s) are invalid and leave the transaction usable', async (_n, coordinates) => {
    const outcome = await handle.db.transaction(async (tx) => {
      const polygon = { type: 'Polygon', coordinates } as unknown as GeoJSON.Polygon
      const checked = await checkGeometry(tx, polygon, signal)
      const line = { type: 'LineString', coordinates } as unknown as GeoJSON.LineString
      const anyChecked = await checkAnyGeometry(tx, line, signal)
      const after = await tx.execute(sql`select 1 as one`)
      return { checked, anyChecked, usable: after.rows.length === 1 }
    })
    expect(outcome.checked.ok).toBe(false)
    expect(outcome.anyChecked.ok).toBe(false)
    expect(outcome.usable).toBe(true)
  })
})
