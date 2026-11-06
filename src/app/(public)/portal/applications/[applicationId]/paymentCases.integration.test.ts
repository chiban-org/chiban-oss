import { beforeAll, expect, vi } from 'vitest'
import { paymentAttempts } from '@/db/schema'
import { createProject } from '@/features/projects/projects'
import type { PermitWorld } from '@/test/applicationFixtures'
import { setupTradeWorld, submittedTrade, type TradeFixture } from '@/test/ledgerFixtures'
import { makeParcel, staffActor } from '@/test/parcels'
import { setupPayments } from '@/test/paymentFixtures'
import { actionHarness, describeActionCases, uuid } from '@/test/testHarness/actions'
import { describeForeignRecordCase } from '@/test/testHarness/actions/foreignRecord'
import { plainPortalRefusals } from '@/test/testHarness/actions/plainRefusals'
import type { PaymentResponse } from './paymentActions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { startPaymentAction } = await import('./paymentActions')

const h = actionHarness()
const signal = new AbortController().signal
const CANNOT_PAY = { ok: false as const, error: 'You cannot pay for this application.' }

let world: PermitWorld
let trade: TradeFixture

beforeAll(async () => {
  world = (await setupTradeWorld(h.db)).world
  await setupPayments(h.db, world.admin, 'simulated', 'sim_town')
  trade = await submittedTrade(h.db, world)
})

describeActionCases(h, 'startPaymentAction', {
  invoke: startPaymentAction,
  actor: () => world.applicant,
  input: () => ({ applicationId: trade.applicationId }),
  fields: { applicationId: uuid({ required: true }) },
  refusedRoles: [
    'inspector',
    'records_custodian',
    'reviewer',
    'board_member',
    'applicant',
    'contractor',
  ],
  refusals: {
    ...plainPortalRefusals<PaymentResponse>(),
    forbidden: CANNOT_PAY,
    invalid: { ok: false, error: 'Choose an application.' },
  },
  accepted: async (result, { db }) => {
    expect(result).toMatchObject({
      ok: true,
      redirectUrl: expect.stringMatching(/^\/dev\/checkout\//),
    })
    const rows = await db.select({ state: paymentAttempts.state }).from(paymentAttempts)
    expect(rows).toEqual([{ state: 'pending' }])
  },
})

describeForeignRecordCase(h, 'startPaymentAction on another applicant record', {
  invoke: startPaymentAction,
  actor: async () => {
    const stranger = await staffActor(h.db, 'applicant')
    const parcelId = await makeParcel(h.db, [])
    const project = await createProject(h.db, stranger, { parcelId, title: 'Shed' }, signal)
    if (!project.ok) throw new Error('project failed')
    return stranger
  },
  input: () => ({ applicationId: trade.applicationId }),
  refusal: CANNOT_PAY,
})
