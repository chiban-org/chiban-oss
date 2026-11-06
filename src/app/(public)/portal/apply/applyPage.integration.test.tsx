import { eq } from 'drizzle-orm'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parcels } from '@/db/schema'
import type { Actor } from '@/features/auth/actor'
import { type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'

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

const { default: ApplyPage } = await import('./page')

let handle: TestDb
let world: PermitWorld

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  await handle.db
    .update(parcels)
    .set({ siteAddress: '12 Heron Cove Road' })
    .where(eq(parcels.id, world.parcelId))
  state.actor = world.applicant
})
afterAll(async () => {
  await handle.drop()
})

const render = async (searchParams: { q?: string; parcel?: string }) =>
  renderToStaticMarkup(await ApplyPage({ searchParams: Promise.resolve(searchParams) }))

describe('portal apply page', () => {
  it('names the chosen parcel by its address as well as its ID', async () => {
    const html = await render({ parcel: world.parcelId })
    expect(html).toContain('12 Heron Cove Road, parcel 007001000000')
  })

  it('refuses a retired parcel at the type step', async () => {
    await handle.db.update(parcels).set({ status: 'retired' }).where(eq(parcels.id, world.parcelId))
    const html = await render({ parcel: world.parcelId })
    expect(html).toContain('takes no new applications')
    expect(html).not.toContain('Application type')
    await handle.db.update(parcels).set({ status: 'active' }).where(eq(parcels.id, world.parcelId))
  })

  it('gives the same hint for a whitespace-only search as for one character', async () => {
    expect(await render({ q: '   ' })).toContain('Enter at least two characters.')
    expect(await render({ q: 'a' })).toContain('Enter at least two characters.')
  })

  it('shows no hint before anything is typed', async () => {
    expect(await render({ q: '' })).not.toContain('Enter at least two characters.')
  })
})
