import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { makeTestDb, type TestDb } from '@/test/db'
import { seedParcelWorld, staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'

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

const { default: CardPaymentsPage } = await import('./page')
const { default: SettingsKeyPage } = await import('../[kind]/[key]/page')

let handle: TestDb

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  await seedParcelWorld(handle.db)
  const admin = await staffActor(handle.db, 'admin')
  await setupPayments(handle.db, admin)
  state.actor = admin
})
afterAll(async () => {
  await handle.drop()
})

describe('card payments page', () => {
  it('edits the fee and receipts with the shared draft, publish and history flow', async () => {
    const html = renderToStaticMarkup(await CardPaymentsPage())
    const text = html.replace(/<[^>]+>/g, ' ')
    expect(text).toContain('Save draft')
    expect(text).toContain('Version history')
    expect(text).not.toContain('Publish payment settings')
    expect(html).not.toContain('href="/staff/settings/payment_settings"')
  })

  it('sends the separate payment settings editor back to the card payments page', async () => {
    const opened = SettingsKeyPage({
      params: Promise.resolve({ kind: 'payment_settings', key: 'default' }),
    })
    await expect(opened).rejects.toThrow('NEXT_REDIRECT:/staff/settings/payments')
  })
})
