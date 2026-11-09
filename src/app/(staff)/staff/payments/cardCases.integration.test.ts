import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { CardStartResult } from '@/app/(staff)/staff/applications/[applicationId]/cardTypes'
import { ledgerEntries, paymentAttempts, processorAccounts } from '@/db/schema'
import type { PermitWorld } from '@/test/applicationFixtures'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { setupPayments } from '@/test/paymentFixtures'
import { plainRefusalFor } from '@/test/refusalCopy'
import {
  actionHarness,
  describeActionCases,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'
import type { Refusals } from '@/test/testHarness/actions/cases'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const { startCardAction } = await import('./cardActions')

const h = actionHarness()
let world: PermitWorld

beforeAll(async () => {
  world = (await setupTradeWorld(h.db)).world
  await setupPayments(h.db, world.admin, 'simulated', 'sim_town')
})

const CARD_REFUSALS = STAFF_REFUSALS as unknown as Refusals<CardStartResult>

const balance = async () => (await submittedTrade(h.db, world)).applicationId

describeActionCases(h, 'startCardAction', {
  invoke: startCardAction,
  actor: () => h.actorFor('staff'),
  input: async () => ({ applicationId: await balance(), payerName: 'Pat Contractor' }),
  fields: {
    applicationId: uuid({ required: true }),
    payerName: text({ required: true, max: 200 }),
  },
  capability: 'payment.collect',
  refusals: {
    ...CARD_REFUSALS,
    invalid: plainRefusalFor({
      applicationId: 'Choose an application.',
      payerName: {
        missing: 'Enter the payer name.',
        whitespace: 'Enter the payer name.',
        otherwise: 'Enter the payer name of 200 characters or fewer.',
      },
    }),
  },
  accepted: async (outcome, { db, written }) => {
    const result = outcome as CardStartResult
    if (!result.ok) throw new Error(result.error)
    expect(result.outcomeUnknown).toBe(false)
    const [attempt] = await db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, result.attemptId))
    expect(attempt).toMatchObject({ channel: 'card_present', state: 'pending' })
    expect(written).not.toContain('ledger_entries')
    expect(
      await db
        .select()
        .from(ledgerEntries)
        .where(eq(ledgerEntries.paymentAttemptId, result.attemptId)),
    ).toHaveLength(0)
  },
  ignoreWrites: ['simulated_processor_objects'],
})

describe('startCardAction refusals in plain words', () => {
  it('says a card payment is already waiting', async () => {
    h.signIn(await h.actorFor('staff'))
    const applicationId = await balance()
    await startCardAction(h.form({ applicationId, payerName: 'Pat' }))
    expect(await startCardAction(h.form({ applicationId, payerName: 'Pat' }))).toEqual({
      ok: false,
      error:
        'A card payment on this application is still waiting on the processor. Check it or void it under Payments first.',
    })
  })

  it('says why when no reader device is set up', async () => {
    h.signIn(await h.actorFor('staff'))
    const applicationId = await balance()
    const [active] = await h.db
      .select()
      .from(processorAccounts)
      .where(eq(processorAccounts.isActive, true))
    await setupPayments(h.db, world.admin, 'clover', 'clover_town')
    const refused = await startCardAction(h.form({ applicationId, payerName: 'Pat' }))
    await h.db.update(processorAccounts).set({ isActive: false })
    await h.db
      .update(processorAccounts)
      .set({ isActive: true })
      .where(eq(processorAccounts.id, active?.id ?? ''))
    expect(refused).toEqual({
      ok: false,
      error:
        'Card at the counter is off because no card reader device is set up in Payment settings.',
    })
  })
})
