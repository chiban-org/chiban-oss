import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeApplication, type PermitWorld, setupPermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { staffActor } from '@/test/parcels'

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

const { default: PortalHomePage } = await import('@/app/(public)/portal/page')

let handle: TestDb
let world: PermitWorld
let number = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = await setupPermitWorld(handle.db)
  number = (await makeApplication(handle.db, world)).number
})
afterAll(async () => {
  await handle.drop()
})

describe('applicant portal home', () => {
  it('sends a signed-out visitor to sign in', async () => {
    state.actor = null
    await expect(PortalHomePage()).rejects.toThrow('NEXT_REDIRECT:/sign-in?next=%2Fportal')
  })

  it('lists the applicant their own application with its project and a readable status', async () => {
    state.actor = world.applicant
    const html = renderToStaticMarkup(await PortalHomePage())
    expect(html).toContain(number)
    expect(html).toContain('Garage addition')
    expect(html).toContain('Draft')
  })

  it('shows an empty state with a lookup link to someone with no applications', async () => {
    state.actor = await staffActor(handle.db, 'applicant')
    const html = renderToStaticMarkup(await PortalHomePage())
    expect(html).toContain('You have no applications yet.')
    expect(html).toContain('href="/parcels"')
    expect(html).toContain('href="/portal/apply"')
  })

  it('lists town staff only the applications they are a party to, with a way to the staff area', async () => {
    state.actor = await staffActor(handle.db, 'staff')
    const html = renderToStaticMarkup(await PortalHomePage())
    expect(html).not.toContain(number)
    expect(html).toContain('You have no applications yet.')
    expect(html).toContain('href="/staff"')
  })
})
