import { readFileSync } from 'node:fs'
import path from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import proj4 from 'proj4'
import { describe, expect, it } from 'vitest'
import { readGeoJson } from '@/features/gis/readers/geojson'
import { readGeoPackage } from '@/features/gis/readers/geopackage'
import { readShapefileZip } from '@/features/gis/readers/shapefile'
import { buildLots, NH_STATE_PLANE_FEET_PROJ4 } from '@/test/fixtureBuilders/alderPondGrid'
import { buildGeoPackage } from '@/test/fixtureBuilders/geopackageWriter'
import { buildShapefileZip } from '@/test/fixtureBuilders/shapefileWriter'

const signal = new AbortController().signal
const FIXTURES = path.resolve(import.meta.dirname, '../../../test/fixtures/gis')
const bytes = (name: string) => new Uint8Array(readFileSync(path.join(FIXTURES, name)))
const text = (s: string) => new TextEncoder().encode(s)

function vertices(g: GeoJSON.Geometry | null): [number, number][] {
  if (g?.type === 'Polygon') return g.coordinates.flat() as [number, number][]
  if (g?.type === 'MultiPolygon') return g.coordinates.flat(2) as [number, number][]
  return []
}

describe('shapefile reader', () => {
  it('state plane shapefile reprojects', async () => {
    const r = await readShapefileZip(bytes('alder-pond-stateplane.zip'), signal)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(36)
    const expected = proj4(NH_STATE_PLANE_FEET_PROJ4, 'EPSG:4326', [1_000_000, 500_000])
    const corner = vertices(r.value[0]?.geometry ?? null).find(
      ([lon, lat]) =>
        Math.abs(lon - (expected[0] ?? 0)) < 1e-6 && Math.abs(lat - (expected[1] ?? 0)) < 1e-6,
    )
    expect(corner).toBeDefined()
    for (const [lon] of vertices(r.value[0]?.geometry ?? null)) {
      expect(lon).toBeGreaterThan(-73)
      expect(lon).toBeLessThan(-70)
    }
  })

  it('missing prj fails', async () => {
    const r = await readShapefileZip(buildShapefileZip(buildLots(), { prj: false }), signal)
    expect(r).toMatchObject({ ok: false, error: { kind: 'missing_projection' } })
  })

  it('missing shp fails with missing_part', async () => {
    const { 'alder-pond.shp': _shp, ...files } = unzipSync(bytes('alder-pond-stateplane.zip'))
    const r = await readShapefileZip(zipSync(files), signal)
    expect(r).toMatchObject({ ok: false, error: { kind: 'missing_part' } })
  })

  it('dbf text id keeps leading zeros and numeric stays a number', async () => {
    const r = await readShapefileZip(bytes('alder-pond-stateplane.zip'), signal)
    if (!r.ok) throw new Error('read')
    expect(r.value[0]?.properties.MAPLOT).toBe('007001000000')
    expect(typeof r.value[0]?.properties.LOTNUM).toBe('number')
  })

  it('a corrupt zip is malformed', async () => {
    const r = await readShapefileZip(text('not a zip'), signal)
    expect(r).toMatchObject({ ok: false, error: { kind: 'malformed' } })
  })
})

describe('geopackage reader', () => {
  it('geopackage reads 36 features with string ids', async () => {
    const r = await readGeoPackage(bytes('alder-pond.gpkg'), signal)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toHaveLength(36)
    expect(r.value[0]?.properties.MAPLOT).toBe('007001000000')
    const [lon] = vertices(r.value[0]?.geometry ?? null)[0] ?? [0]
    expect(lon).toBeGreaterThan(-73)
    expect(lon).toBeLessThan(-70)
  })

  it('geopackage with two feature tables needs a table name', async () => {
    const two = buildGeoPackage(buildLots(), { extraTable: true, emptyFirstGeometry: false })
    expect(await readGeoPackage(two, signal)).toMatchObject({
      ok: false,
      error: { kind: 'multiple_tables' },
    })
    const named = await readGeoPackage(two, signal, { table: 'parcels_copy' })
    expect(named.ok && named.value).toHaveLength(36)
  })

  it('empty geopackage geometry reads as null', async () => {
    const gpkg = buildGeoPackage(buildLots(), { extraTable: false, emptyFirstGeometry: true })
    const r = await readGeoPackage(gpkg, signal)
    if (!r.ok) throw new Error('read')
    expect(r.value[0]?.geometry).toBeNull()
    expect(r.value[1]?.geometry).not.toBeNull()
  })

  it('a non-sqlite file is malformed', async () => {
    expect(await readGeoPackage(text('nope'), signal)).toMatchObject({
      ok: false,
      error: { kind: 'malformed' },
    })
  })
})

describe('geojson reader', () => {
  it('reads the parcel fixture with row refs as indexes', async () => {
    const r = await readGeoJson(bytes('alder-pond-parcels.geojson'), signal)
    expect(r.ok && r.value).toHaveLength(36)
    expect(r.ok && r.value[3]?.rowRef).toBe('3')
  })

  it('geojson with an EPSG:3437 crs member is unsupported_projection', async () => {
    const body = {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3437' } },
      features: [],
    }
    expect(await readGeoJson(text(JSON.stringify(body)), signal)).toMatchObject({
      ok: false,
      error: { kind: 'unsupported_projection' },
    })
  })

  it('a CRS84 member is accepted and feature ids become row refs', async () => {
    const body = {
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
      features: [{ type: 'Feature', id: 'a1', properties: { X: 1 }, geometry: null }],
    }
    const r = await readGeoJson(text(JSON.stringify(body)), signal)
    expect(r.ok && r.value[0]?.rowRef).toBe('a1')
  })

  it('invalid json is malformed', async () => {
    expect(await readGeoJson(text('{'), signal)).toMatchObject({
      ok: false,
      error: { kind: 'malformed' },
    })
  })
})
