import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'

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
  useRouter: () => ({ push: () => undefined }),
}))

const { default: StaffMapPage } = await import('./page')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  state.actor = await staffActor(handle.db, 'staff')
})
afterAll(async () => {
  await handle.drop()
})

describe('staff map page', () => {
  it('points keyboard users to parcel search, which this page links to, not to a search box it lacks', async () => {
    const html = renderToStaticMarkup(await StaffMapPage())
    expect(html).not.toContain('search box')
    expect(html).toContain(
      'The map is a visual aid. Use parcel search, linked below, to find a parcel with the keyboard.',
    )
    expect(html).toContain('href="/staff/parcels"')
  })
})
