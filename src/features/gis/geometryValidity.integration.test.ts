import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkGeometry } from '@/features/gis/geometryValidity'
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
})
