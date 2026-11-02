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

const { default: CashReceiptsPage } = await import('./page')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  state.actor = await staffActor(handle.db, 'finance')
})
afterAll(async () => {
  await handle.drop()
})

describe('cash receipts report heading', () => {
  it('writes the report day in words', async () => {
    const html = renderToStaticMarkup(
      await CashReceiptsPage({ searchParams: Promise.resolve({ date: '2026-11-02' }) }),
    )
    expect(html).toContain('<h2>November 2, 2026</h2>')
    expect(html).not.toContain('<h2>2026-11-02</h2>')
  })
})
