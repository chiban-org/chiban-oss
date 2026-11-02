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
}))
vi.mock('@/app/(staff)/staff/settings/actions', () => ({
  adoptStarterAction: () => Promise.resolve({ ok: true, message: '' }),
}))

const { default: SettingsPage } = await import('./page')

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

describe('settings page', () => {
  it('lists pack rules by name and version without their keys', async () => {
    const text = renderToStaticMarkup(await SettingsPage()).replace(/<[^>]+>/g, ' ')
    expect(text).toContain('Building permit decision deadline')
    expect(text).toContain('Version 1')
    expect(text).not.toContain('nh.bp.decision')
    expect(text).not.toContain('town.bp.expiration')
  })
})
