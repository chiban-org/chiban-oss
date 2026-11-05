import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { adoptStarter } from '@/features/config/adoptStarter'
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
}))
vi.mock('@/app/(staff)/staff/settings/actions', () => ({
  adoptStarterAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: SettingsPage } = await import('./page')
const { default: StateLawPage } = await import('./state-law/page')
const { default: StartersPage } = await import('./starters/page')

let handle: TestDb
let admin: Actor
const signal = new AbortController().signal

async function settingsFor(actor: Actor): Promise<string> {
  state.actor = actor
  try {
    return renderToStaticMarkup(await SettingsPage())
  } catch (error) {
    return (error as Error).message
  } finally {
    state.actor = admin
  }
}

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  admin = await staffActor(handle.db, 'admin')
  state.actor = admin
})
afterAll(async () => {
  await handle.drop()
})

describe('settings index', () => {
  it('opens the first settings page each role can use', async () => {
    expect(await settingsFor(admin)).toBe('NEXT_REDIRECT:/staff/settings/town-profile')
  })

  it('refuses a viewer who can open no settings page', async () => {
    for (const role of ['finance', 'staff', 'records_custodian'] as const) {
      const html = await settingsFor(await staffActor(handle.db, role))
      expect(html).toContain('You do not have permission to change settings.')
    }
  })
})

describe('state law page', () => {
  it('lists pack rules by name, without their keys or a version on every row', async () => {
    const html = renderToStaticMarkup(await StateLawPage({ searchParams: Promise.resolve({}) }))
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).toContain('Building permit decision deadline')
    expect(text).not.toContain('nh.bp.decision')
    expect(text).not.toContain('town.bp.expiration')
    expect(html).toMatch(/<h2[^>]*>Required rules by classification<\/h2>/)
    expect(text).not.toMatch(/Local zoning permit:\s/)
    expect(html).not.toMatch(/<td>[^<]*<span[^>]*>Version \d+<\/span>/)
    expect(html).toContain('href="/staff/settings/state-law?rules_sort=')
  })

  it('refuses anyone without the right to edit configuration', async () => {
    state.actor = await staffActor(handle.db, 'staff')
    const html = renderToStaticMarkup(await StateLawPage({ searchParams: Promise.resolve({}) }))
    state.actor = admin
    expect(html).toContain('You do not have permission')
  })
})

describe('starter templates page', () => {
  it('lists adopted starters apart from the ones still to adopt', async () => {
    const adopted = await adoptStarter(handle.db, admin, 'nh.starter.electrical', signal)
    if (!adopted.ok) throw new Error(JSON.stringify(adopted.error))
    const html = renderToStaticMarkup(await StartersPage())
    const split = html.indexOf('>Adopted<')
    expect(html.slice(split)).toContain('Electrical permit')
    expect(html.slice(split)).not.toContain('Adopt this starter')
    expect(html.slice(0, split)).toContain('Adopt this starter')
  })

  it('links to the starter updates page', async () => {
    const html = renderToStaticMarkup(await StartersPage())
    expect(html).toMatch(
      /<a [^>]*href="\/staff\/settings\/starters\/updates"[^>]*>Check adopted starters for updates<\/a>/,
    )
  })

  it('refuses anyone without the right to edit configuration', async () => {
    for (const role of ['staff', 'records_custodian'] as const) {
      state.actor = await staffActor(handle.db, role)
      const html = renderToStaticMarkup(await StartersPage())
      expect(html).toContain('You do not have permission')
      expect(html).not.toContain('Adopt this starter')
    }
    state.actor = admin
  })
})
