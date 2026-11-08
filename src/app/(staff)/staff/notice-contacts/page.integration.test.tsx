import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { associationRosters, parcelAliases } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { upsertAssociation } from '@/features/rosters/associations'
import { upsertPark } from '@/features/rosters/parks'
import { endRestriction } from '@/features/rosters/restrictionEnd'
import { addRestriction } from '@/features/rosters/restrictions'
import { type BoardWorld, setupBoardWorld } from '@/test/boardFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { makeParcel } from '@/test/parcels'
import type { CivilDate } from '@/types/civilDate'

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
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: NoticeContactsPage } = await import('./page')

const signal = new AbortController().signal
let handle: TestDb
let world: BoardWorld
let endedHolderId = ''

async function html(raw: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(
    (await NoticeContactsPage({ searchParams: Promise.resolve(raw) })) as never,
  )
}

function text(markup: string): string {
  return markup
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .replaceAll(/ ([.,])/g, '$1')
}

const rowCount = (markup: string) => (markup.match(/<tr id="entry-/g) ?? []).length

async function seed(): Promise<void> {
  const lot = (n: number, site: string) =>
    makeParcel(handle.db, [{ format: 'gis12', value: `0090${n}0000000` }], { siteAddress: site })
  const condo = await lot(10, '14 Pond Road')
  await upsertAssociation(
    handle.db,
    world.staff,
    {
      parcelId: condo,
      associationName: 'Heron Landing Owners',
      officers: [{ name: 'Dana Whitcomb', title: 'President', mailingAddress: 'PO Box 105' }],
      asOf: '2026-10-01' as CivilDate,
    },
    signal,
  )
  await handle.db
    .update(associationRosters)
    .set({ asOf: '2025-01-10', checkedOn: '2025-01-10' })
    .where(eq(associationRosters.parcelId, condo))
  const second = await lot(11, '3 Loon Way')
  await upsertAssociation(
    handle.db,
    world.staff,
    {
      parcelId: second,
      associationName: 'Loon Cove Condominium',
      officers: [{ name: 'Lee Marsh', title: 'Treasurer', mailingAddress: 'PO Box 106' }],
      asOf: '2026-10-01' as CivilDate,
    },
    signal,
  )
  await upsertPark(
    handle.db,
    world.staff,
    {
      parcelId: await lot(12, '1 Merganser Court'),
      parkName: 'Merganser Court',
      ownerName: 'Merganser Holdings LLC',
      ownerMailingAddress: '1 Merganser Court',
      tenants: Array.from({ length: 24 }, (_, i) => ({
        tenantId: `site-${i + 1}`,
        name: `Tenant ${i + 1}`,
        siteLabel: `Site ${i + 1}`,
        mailingAddress: `${i + 1} Merganser Court`,
      })),
      asOf: '2026-10-01' as CivilDate,
    },
    signal,
  )
  const land = await lot(13, '40 Ridge Road')
  for (const holderName of ['Alder Valley Land Trust', 'Pine River Trust']) {
    const added = await addRestriction(
      handle.db,
      world.staff,
      {
        parcelId: land,
        holderName,
        holderMailingAddress: '2 Trust Lane',
        restrictionKind: 'conservation',
        recordedReference: 'Book 412, Page 88',
      },
      signal,
    )
    if (added.ok && endedHolderId === '') endedHolderId = added.value.holdingId
  }
  await endRestriction(
    handle.db,
    world.staff,
    { holdingId: endedHolderId, endedOn: '2026-01-15' as CivilDate },
    signal,
  )
  const gap = await lot(14, '7 Marsh Lane')
  await handle.db.insert(parcelAliases).values(
    ['009014000001', '009014000002'].map((value) => ({
      parcelId: gap,
      format: 'cama15',
      value,
      valueNormalized: value,
      status: 'active' as const,
      source: 'manual' as const,
    })),
  )
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupBoardWorld(handle.db)
  state.actor = world.staff
  await seed()
})
afterAll(async () => {
  await handle.drop()
})

describe('the notice contacts page', () => {
  it('opens on active associations under kind tabs with counts, missing associations first', async () => {
    const page = text(await html())
    expect(page).toMatch(
      /Missing association 1 Associations 2 Parks 1 Restriction holders 1 Regional and state/,
    )
    expect(page).toContain('Condo associations')
    expect(page).toContain('Heron Landing Owners')
    expect(page).not.toContain('Merganser Court')
    expect(page).toContain('No association on file for 1 condo parcel.')
  })

  it('links the missing count to its tab, which offers Add association per parcel', async () => {
    expect(await html()).toContain('href="/staff/notice-contacts?kind=missing"')
    const missing = text(await html({ kind: 'missing' }))
    expect(missing).toContain('Condo parcels with no association on file')
    expect(missing).toContain('7 Marsh Lane, 2 units')
    expect(missing).toContain('Add association')
  })

  it('shows each kind on its own tab and regional contacts read-only', async () => {
    expect(text(await html({ kind: 'parks' }))).toContain('Manufactured housing parks')
    const holders = text(await html({ kind: 'holders' }))
    expect(holders).toContain('Pine River Trust')
    expect(holders).toContain('Record a check')
    const regional = await html({ kind: 'regional' })
    expect(text(regional)).toContain('Regional and state contacts')
    expect(regional).not.toContain('<table')
  })

  it('searches by name, parcel ID and address', async () => {
    expect(rowCount(await html({ q: 'loon' }))).toBe(1)
    expect(rowCount(await html({ q: '009010' }))).toBe(1)
    expect(text(await html({ q: 'pond road' }))).toContain('Heron Landing Owners')
    expect(text(await html({ q: 'nobody' }))).toContain('No associations match.')
  })

  it('hides ended rows until Ended is picked, and never offers Confirm on them', async () => {
    const active = await html({ kind: 'holders' })
    expect(text(active)).not.toContain('Alder Valley Land Trust')
    expect(active).toContain('Confirm Pine River Trust on')
    const ended = await html({ kind: 'holders', status: 'ended' })
    expect(text(ended)).toContain('Alder Valley Land Trust')
    expect(ended).not.toContain('Confirm Alder Valley Land Trust')
    expect(ended).toContain('Undo ending Alder Valley Land Trust on')
  })

  it('folds the 24 park tenants into a closed disclosure', async () => {
    const parks = await html({ kind: 'parks' })
    expect(parks).toMatch(/<details><summary[^>]*>24 tenants<\/summary>/)
    expect(text(parks)).toContain('Tenant 24, Site 24')
  })

  it('filters to rows due for a check from the key facts link', async () => {
    const page = await html()
    expect(text(page)).toContain('Due for a check: 1 association.')
    expect(page).toContain('href="/staff/notice-contacts?due=yes">1 association</a>')
    const due = await html({ due: 'yes' })
    expect(rowCount(due)).toBe(1)
    expect(text(due)).toContain('Heron Landing Owners')
    expect(text(due)).not.toContain('Loon Cove Condominium')
  })

  it('lands a deep link on its row, even after it ended', async () => {
    const linked = await html({ kind: 'holders', entry: endedHolderId })
    expect(linked).toContain(`id="entry-${endedHolderId}"`)
    expect(rowCount(linked)).toBe(1)
    expect(text(linked)).toContain('Showing the contact an abutter list links to.')
    expect(linked).toContain(
      'href="/staff/notice-contacts?kind=holders">Show all restriction holders',
    )
  })
})
