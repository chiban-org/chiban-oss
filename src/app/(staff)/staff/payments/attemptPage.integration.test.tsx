import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import type { PermitWorld } from '@/test/applicationFixtures'
import { makeTestDb, type TestDb } from '@/test/db'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { staffActor } from '@/test/parcels'
import { makeCardAttempt, setupPayments } from '@/test/paymentFixtures'

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
    throw new Error('NOT_FOUND')
  },
}))
vi.mock('../actions', () => ({
  checkWithProcessorAction: () => Promise.resolve({ ok: true }),
  voidAttemptAction: () => Promise.resolve({ ok: true }),
}))

const { default: AttemptPage } = await import('./[attemptId]/page')

let handle: TestDb
let world: PermitWorld
let attemptId = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  world = (await setupTradeWorld(handle.db)).world
  await setupPayments(handle.db, world.admin)
  const trade = await submittedTrade(handle.db, world)
  attemptId = (await makeCardAttempt(handle.db, trade, 'card_present')).attemptId
})
afterAll(async () => {
  await handle.drop()
})

async function render(actor: Actor): Promise<string> {
  state.actor = actor
  return renderToStaticMarkup(await AttemptPage({ params: Promise.resolve({ attemptId }) }))
}

describe('payment attempt page', () => {
  it('shows human labels and an explicit empty history', async () => {
    const html = await render(world.staff)
    expect(html).toContain('paid by card at the counter')
    expect(html).toContain('Waiting for the processor')
    expect(html).not.toContain('State: pending')
    expect(html).not.toContain('card present')
    expect(html).toContain('No events yet')
  })

  it('hides the void control from staff who cannot void', async () => {
    const html = await render(world.staff)
    expect(html).not.toContain('Void this attempt')
  })

  it('offers the void control to finance', async () => {
    const finance = await staffActor(handle.db, 'finance')
    expect(await render(finance)).toContain('Void this attempt')
  })
})
