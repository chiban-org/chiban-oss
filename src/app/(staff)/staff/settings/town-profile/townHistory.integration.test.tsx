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
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const { default: TownProfilePage } = await import('./page')
const { default: SettingsKeyPage } = await import('../[kind]/[key]/page')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  state.actor = await staffActor(handle.db, 'admin')
})
afterAll(async () => {
  await handle.drop()
})

describe('town profile version history', () => {
  it('shows the history on the town profile page instead of linking to the full editor', async () => {
    const html = renderToStaticMarkup(await TownProfilePage())
    expect(html).toContain('id="version-history"')
    expect(html).not.toContain('href="/staff/settings/town_profile/default"')
  })

  it('sends the generic town profile editor back to the town profile page', async () => {
    const outcome = await SettingsKeyPage({
      params: Promise.resolve({ kind: 'town_profile', key: 'default' }),
    }).catch((error: Error) => error.message)
    expect(outcome).toBe('NEXT_REDIRECT:/staff/settings/town-profile')
  })
})
