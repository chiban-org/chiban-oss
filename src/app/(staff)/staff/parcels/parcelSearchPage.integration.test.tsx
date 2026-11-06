import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { PARCEL_PAGE_SIZE } from '@/features/parcels/searchParcels'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel, seedParcelWorld, staffActor } from '@/test/parcels'

interface MockState {
  db: unknown
  actor: Actor | null
}

const state = vi.hoisted((): MockState => ({ db: null, actor: null }))

vi.mock('@/db/client', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: StaffParcelsPage } = await import('./page')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  await makeParcel(handle.db, [{ format: 'gis12', value: '007015000000' }], {
    siteAddress: '16 Larkspur Lane',
    ownerName: 'Quillfeather, Odessa',
  })
  state.actor = await staffActor(handle.db)
})
afterAll(async () => {
  await handle.drop()
})

describe('staff parcel search page', () => {
  it('links each owner to a search for that owner', async () => {
    const html = renderToStaticMarkup(
      await StaffParcelsPage({ searchParams: Promise.resolve({ q: 'Larkspur Lane' }) }),
    )
    expect(html).toContain('href="/staff/parcels?q=Quillfeather%2C%20Odessa"')
    expect(html).toContain('Search parcels owned by Quillfeather, Odessa')
  })

  it('sorts by a column header and carries the sort and filters through the search form', async () => {
    const html = renderToStaticMarkup(
      await StaffParcelsPage({
        searchParams: Promise.resolve({
          q: 'Lane',
          sort: 'owner',
          dir: 'desc',
          matched: 'address',
        }),
      }),
    )
    expect(html).toContain('aria-sort="descending"')
    expect(html).toContain('name="sort" value="owner"')
    expect(html).toContain('name="dir" value="desc"')
    expect(html).toContain('name="matched" value="address"')
    expect(html).toContain('Quick filters')
    expect(html).toContain('Clear all')
  })

  it('says so when the filters hide every hit', async () => {
    const html = renderToStaticMarkup(
      await StaffParcelsPage({
        searchParams: Promise.resolve({ q: 'Larkspur Lane', status: 'retired' }),
      }),
    )
    expect(html).toContain('No parcels match these filters.')
  })

  it('says the default order is best matches first', async () => {
    const html = renderToStaticMarkup(
      await StaffParcelsPage({ searchParams: Promise.resolve({ q: 'Larkspur Lane' }) }),
    )
    expect(html).toContain('Best matches first. Click a column heading to sort.')
  })

  it('treats active and retired as one choice', async () => {
    const html = renderToStaticMarkup(
      await StaffParcelsPage({
        searchParams: Promise.resolve({ q: 'Larkspur Lane', status: ['active', 'retired'] }),
      }),
    )
    expect(html).toContain('name="status" value="active"')
    expect(html).not.toContain('name="status" value="retired"')
    expect(html).not.toContain('No parcels match these filters.')
  })

  it('lists parcels before any search is typed', async () => {
    const html = renderToStaticMarkup(await StaffParcelsPage({ searchParams: Promise.resolve({}) }))
    expect(html).toContain('All parcels')
    expect(html).toContain('16 Larkspur Lane')
    expect(html).toContain('007015000000')
    expect(html).not.toContain('Enter at least two characters.')
    expect(html).not.toContain('aria-label="Pages"')
  })

  it('pages the browse list when there are more parcels than one page holds', async () => {
    for (let i = 0; i < PARCEL_PAGE_SIZE; i += 1) {
      await makeParcel(
        handle.db,
        [{ format: 'gis12', value: `0090${String(i).padStart(8, '0')}` }],
        { siteAddress: `${i} Filler Street` },
      )
    }
    const first = renderToStaticMarkup(
      await StaffParcelsPage({ searchParams: Promise.resolve({}) }),
    )
    expect(first).toContain('aria-label="Pages"')
    expect(first).toContain('href="/staff/parcels?cursor=20"')
    const second = renderToStaticMarkup(
      await StaffParcelsPage({ searchParams: Promise.resolve({ cursor: '20' }) }),
    )
    expect(second).toContain('Previous page')
    expect(second).not.toContain('Next page')
  })

  it('still asks for more characters when a one-character search is typed', async () => {
    const html = renderToStaticMarkup(
      await StaffParcelsPage({ searchParams: Promise.resolve({ q: 'L' }) }),
    )
    expect(html).toContain('Enter at least two characters.')
  })
})
