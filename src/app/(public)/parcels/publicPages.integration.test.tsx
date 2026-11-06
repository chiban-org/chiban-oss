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
