import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
  state.actor = world.applicant
})
afterAll(async () => {
  await handle.drop()
})

const render = async () =>
  renderToStaticMarkup(
    await ApplyPage({ searchParams: Promise.resolve({ parcel: world.parcelId }) }),
  )

describe('portal apply list for the energy code and temporary use starters', () => {
  it('omits both until the town adopts them', async () => {
    const html = await render()
    expect(html).not.toContain('Temporary use permit')
    expect(html).not.toContain('Residential energy code certificate')
  })

  it('lists both once adopted', async () => {
    const { adoptStarter } = await import('@/features/config/adoptStarter')
    for (const id of ['nh.starter.energy_code', 'nh.starter.temporary_use']) {
      const adopted = await adoptStarter(handle.db, world.admin, id, new AbortController().signal)
      expect(adopted.ok).toBe(true)
    }
    const html = await render()
    expect(html).toContain('Temporary use permit')
    expect(html).toContain('Residential energy code certificate')
  })
})
