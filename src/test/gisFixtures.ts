import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { gisLayers } from '@/db/schema'
import type { LayerKey } from '@/features/gis/exceptionKinds'
import type { SourceFeature } from '@/features/gis/import/types'

const FIXTURE_DIR = path.resolve(import.meta.dirname, 'fixtures/gis')

export const PARCEL_MAPPING = {
  primaryId: { field: 'MAPLOT', format: 'gis12', padNumeric: false },
  extraIds: [
    { field: 'CAMA', format: 'cama15', padNumeric: false },
    { field: 'CAMA_2', format: 'cama15', padNumeric: false },
    { field: 'CAMA_3', format: 'cama15', padNumeric: false },
  ],
  siteAddress: { fields: ['SITE_ADDR'] },
  ownerName: 'OWNER',
  mailingAddress: { fields: ['MAIL_ADDR'] },
} as const

export function loadGeoJsonFixture(name: string): SourceFeature[] {
  const raw = readFileSync(path.join(FIXTURE_DIR, name), 'utf8')
  const collection = JSON.parse(raw) as GeoJSON.FeatureCollection
  return collection.features.map((f, i) => ({
    rowRef: String(i),
    properties: f.properties ?? {},
    geometry: f.geometry,
  }))
}

export async function configureLayer(
  db: Db,
  key: LayerKey,
  mapping: object,
  patch: Partial<typeof gisLayers.$inferInsert> = {},
): Promise<void> {
  await db
    .update(gisLayers)
    .set({ mapping, ...patch })
    .where(eq(gisLayers.key, key))
}

export interface FixtureFetchOptions {
  failOnPage?: number
  errorBody?: boolean
}

export interface FixtureFetch {
  fetch: typeof fetch
  calls: string[]
}

export function fixtureFetch(dir: string, opts: FixtureFetchOptions = {}): FixtureFetch {
  const calls: string[] = []
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const impl = (input: string | URL | Request): Promise<Response> => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    calls.push(url.pathname + url.search)
    if (opts.errorBody === true) {
      return Promise.resolve(json({ error: { code: 499, message: 'Token Required' } }))
    }
    if (!url.pathname.endsWith('/query')) {
      return Promise.resolve(
        json(JSON.parse(readFileSync(path.join(FIXTURE_DIR, dir, 'metadata.json'), 'utf8'))),
      )
    }
    const offset = Number(url.searchParams.get('resultOffset') ?? '0')
    const count = Number(url.searchParams.get('resultRecordCount') ?? '1')
    const page = Math.floor(offset / count)
    if (opts.failOnPage === page) return Promise.reject(new TypeError('connection reset'))
    return Promise.resolve(
      json(JSON.parse(readFileSync(path.join(FIXTURE_DIR, dir, `page-${page}.json`), 'utf8'))),
    )
  }
  return { fetch: impl, calls }
}
