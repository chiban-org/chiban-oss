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

let handle: TestDb
let admin: Actor
const signal = new AbortController().signal

async function page(): Promise<string> {
  return renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }))
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

describe('settings page', () => {
  it('lists pack rules by name, folded, without their keys or a version on every row', async () => {
    const html = await page()
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).toContain('Building permit decision deadline')
    expect(text).not.toContain('nh.bp.decision')
    expect(text).not.toContain('town.bp.expiration')
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Rules from state law<\/summary>/)
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Required rules by classification<\/summary>/)
    expect(html).not.toMatch(/<td>[^<]*<span[^>]*>Version \d+<\/span>/)
  })

  it('folds adopted starters into one line and leaves the rest open', async () => {
    const adopted = await adoptStarter(handle.db, admin, 'nh.starter.electrical', signal)
    if (!adopted.ok) throw new Error(JSON.stringify(adopted.error))
    state.actor = admin
    const html = await page()
    expect(html).toMatch(/<summary[^>]*>1 starter adopted<\/summary>/)
    expect(html).not.toContain('>Adopted<')
    expect(html).toContain('Adopt this starter')
  })

  it('offers no adopt button to someone who may not edit configuration', async () => {
    state.actor = await staffActor(handle.db, 'staff')
    const html = await page()
    expect(html).not.toContain('Adopt this starter')
    state.actor = admin
  })

  it('lists payment and inspection settings together under Other settings', async () => {
    const html = await page()
    expect(html).toContain('<h2>Other settings</h2>')
    expect(html).not.toContain('<h2>Card payments</h2>')
    expect(html).toContain('href="/staff/settings/payments"')
    expect(html).toContain('href="/staff/settings/inspections"')
  })

  it('links to starter updates from the starter templates section', async () => {
    const html = renderToStaticMarkup(await SettingsPage({ searchParams: Promise.resolve({}) }))
    expect(html).toMatch(
      /<a [^>]*href="\/staff\/settings\/starters"[^>]*>Check adopted starters for updates<\/a>/,
    )
  })
})
