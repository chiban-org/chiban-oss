import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { runImport } from '@/features/gis/import/runImport'
import { makeTestDb, type TestDb } from '@/test/db'
import { configureLayer, loadGeoJsonFixture, PARCEL_MAPPING } from '@/test/gisFixtures'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  cookieReads: string[]
  sessionCookie: string | null
}

const state = vi.hoisted(
  (): MockState => ({
    db: null,
    cookieReads: [],
    sessionCookie: null,
  }),
)

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/components/map/LinkedParcelMap', () => ({ LinkedParcelMap: () => <div>map</div> }))
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        state.cookieReads.push(name)
        return name === 'chiban_sid' && state.sessionCookie !== null
          ? { value: state.sessionCookie }
          : undefined
      },
    }),
  headers: () => Promise.resolve(new Headers()),
}))

const { default: PublicParcelPage } = await import('@/app/(public)/parcels/[parcelId]/page')
const { default: PublicParcelsPage } = await import('@/app/(public)/parcels/page')

const signal = new AbortController().signal
let handle: TestDb
let parcelId = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  await configureLayer(handle.db, 'parcels', PARCEL_MAPPING)
  const actor = await staffActor(handle.db)
  await runImport(
    handle.db,
    { kind: 'user', userId: actor.userId },
    {
      layerKey: 'parcels',
      adapter: 'file_geojson',
      features: loadGeoJsonFixture('alder-pond-parcels.geojson'),
      fullLayer: true,
    },
    signal,
  )
  const alias = await handle.db.query.parcelAliases.findFirst({
    where: (a, { eq }) => eq(a.value, '007001000000'),
  })
  parcelId = alias?.parcelId ?? ''
})
afterAll(async () => {
  await handle.drop()
})

async function render(): Promise<string> {
  return renderToStaticMarkup(await PublicParcelPage({ params: Promise.resolve({ parcelId }) }))
}

describe('public parcel page', () => {
  it('renders the facts without a session', async () => {
    const html = await render()
    expect(html).toContain('12 Heron Cove Road')
    expect(html).toContain('Larkspur Family Trust')
    expect(html).not.toContain('PO Box')
  })

  it('public route ignores a staff session cookie', async () => {
    state.cookieReads.length = 0
    state.sessionCookie = null
    const without = await render()
    state.sessionCookie = 'a-staff-session-id'
    const withCookie = await render()
    expect(withCookie).toBe(without)
    expect(state.cookieReads).not.toContain('chiban_sid')
  })
})

describe('public parcel search', () => {
  const search = async (q: string) =>
    renderToStaticMarkup(await PublicParcelsPage({ searchParams: Promise.resolve({ q }) }))

  it('says when it shows only the first matches', async () => {
    for (let i = 0; i < 25; i += 1) {
      await makeParcel(handle.db, [], { siteAddress: `${i} Quarry Ledge Road` })
    }
    const html = await search('Quarry Ledge')
    expect(html).toContain(
      'Showing the first 20 matches. Add more of the address, owner, or parcel ID to narrow the search.',
    )
  })

  it('says nothing about a cap when every match is shown', async () => {
    const html = await search('12 Heron Cove')
    expect(html).toContain('12 Heron Cove Road')
    expect(html).not.toContain('Showing the first')
  })

  it('gives the same hint for a whitespace-only search as for one character', async () => {
    expect(await search('   ')).toContain('Enter at least two characters.')
    expect(await search('a')).toContain('Enter at least two characters.')
  })

  it('shows no hint before anything is typed', async () => {
    expect(await search('')).not.toContain('Enter at least two characters.')
  })
})

describe('public parcel search results', () => {
  const search = async (q: string) =>
    renderToStaticMarkup(await PublicParcelsPage({ searchParams: Promise.resolve({ q }) }))

  it('leads each result with the address, then the map-lot ID and owner', async () => {
    const html = await search('12 Heron Cove')
    const address = html.indexOf('12 Heron Cove Road')
    expect(address).toBeGreaterThan(-1)
    expect(html.indexOf('Map-lot 007001000000')).toBeGreaterThan(address)
    expect(html.indexOf('Larkspur Family Trust')).toBeGreaterThan(address)
  })

  it('lists matches on one street in house-number order', async () => {
    for (const n of [88, 12, 57, 31, 64]) {
      await makeParcel(handle.db, [], { siteAddress: `${n} Wren Hollow Road` })
    }
    const html = await search('Wren Hollow')
    const positions = [12, 31, 57, 64, 88].map((n) => html.indexOf(`>${n} Wren Hollow Road<`))
    expect(positions.every((p) => p > -1)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('suggests a shorter search when nothing matches', async () => {
    const html = await search('Zzyzx Nowhere')
    expect(html).toContain('No parcels match that search.')
    expect(html).toContain('only the street name')
  })

  it('shows a retired parcel with a status chip', async () => {
    await makeParcel(handle.db, [], { siteAddress: '3 Old Mill Spur', status: 'retired' })
    const html = await search('Old Mill Spur')
    expect(html).toMatch(/data-status="neutral"[^>]*>[\s\S]*Retired<\/span>/)
  })
})
