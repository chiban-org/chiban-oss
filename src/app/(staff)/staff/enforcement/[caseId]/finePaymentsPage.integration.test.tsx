import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Actor } from '@/features/auth/actor'
import { recordCounterPayment } from '@/features/counter/counterPayment'
import { recordFine } from '@/features/enforcement/fines'
import { makeTestDb, type TestDb } from '@/test/db'
import {
  type EnforcementWorld,
  issuedOrder,
  judgmentFor,
  setupEnforcementWorld,
} from '@/test/enforcementFixtures'
import { makeTestStore } from '@/test/objectStore'
import type { CivilDate } from '@/types/civilDate'

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
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('@/server/getActor', () => ({ getActor: () => Promise.resolve(state.actor) }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  },
}))

const { default: CasePage } = await import('./page')

const signal = new AbortController().signal
const NOW = new Date('2027-07-20T15:00:00Z')
let handle: TestDb
let world: EnforcementWorld
let caseId = ''

beforeAll(async () => {
  handle = await makeTestDb()
  state.db = handle.db
  const { store } = await makeTestStore()
  world = await setupEnforcementWorld(handle.db)
  const order = await issuedOrder(handle.db, store, world)
  caseId = order.caseId
  const step = await judgmentFor(handle.db, store, world, order)
  const fine = await recordFine(
    handle.db,
    world.finance,
    {
      caseId,
      orderId: order.orderId,
      kind: 'civil_penalty',
      ruleKey: 'nh.enf.penalty_zoning',
      amountCents: 20000,
      imposedOn: '2027-06-18',
      court: 'District Court, Alder Pond Division',
      docket: '2027-CV-0042',
      judgmentStepId: step,
    },
    signal,
    NOW,
  )
  if (!fine.ok) throw new Error(fine.error)
  const paid = await recordCounterPayment(
    handle.db,
    world.finance,
    {
      method: 'check',
      amountCents: 5000,
      checkNumber: '2201',
      payerName: 'Pat Owner',
      allocations: [{ targetKind: 'fine', fineId: fine.value.fineId, amountCents: 5000 }],
    },
    signal,
    NOW,
  )
  if (!paid.ok) throw new Error(paid.error)
})
afterAll(async () => {
  await handle.drop()
})

async function caseText(actor: Actor): Promise<string> {
  state.actor = actor
  const html = renderToStaticMarkup(await CasePage({ params: Promise.resolve({ caseId }) }))
  return html.replace(/<[^>]+>/g, ' ')
}

describe('a fine payment on the case page', () => {
  it('finance staff see the payment with refund and returned check controls', async () => {
    const text = await caseText(world.finance)
    expect(text).toContain('from Pat Owner')
    expect(text).toContain('Refund or reverse')
    expect(text).toContain('Record returned check')
  })

  it('staff who take payments see the payment but no refund controls', async () => {
    const text = await caseText(world.staff)
    expect(text).toContain('from Pat Owner')
    expect(text).not.toContain('Refund or reverse')
  })
})
