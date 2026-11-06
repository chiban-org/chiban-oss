import { eq } from 'drizzle-orm'
import { beforeAll, expect, vi } from 'vitest'
import { ledgerEntries } from '@/db/schema'
import { CHECK_PASSED } from '@/server/formInput'
import type { PermitWorld } from '@/test/applicationFixtures'
import { idMessage, textMessage } from '@/test/boardCases'
import { moneyMessage, useEnforcementClock } from '@/test/enforcementCases'
import { setupTradeWorld, submittedTrade } from '@/test/ledgerFixtures'
import { cardPaymentOnFreshPermit, paidOnFreshPermit } from '@/test/paymentCaseFixtures'
import { setupPayments } from '@/test/paymentFixtures'
import { refusalBy } from '@/test/refusalCopy'
import {
  actionHarness,
  describeActionCases,
  type InvalidVariant,
  money,
  STAFF_REFUSALS,
  text,
  uuid,
} from '@/test/testHarness/actions'

vi.mock('@/db/client', () => import('@/test/testHarness/actions/mocks/dbClient'))
vi.mock('next/cache', () => import('@/test/testHarness/actions/mocks/nextCache'))
vi.mock('next/headers', () => import('@/test/testHarness/actions/mocks/nextHeaders'))
vi.mock('next/navigation', () => import('@/test/testHarness/actions/mocks/nextNavigation'))
vi.mock('@/server/getActor', () => import('@/test/testHarness/actions/mocks/getActor'))

const actions = await import('./actions')

const h = actionHarness()
useEnforcementClock()
let world: PermitWorld

beforeAll(async () => {
  world = (await setupTradeWorld(h.db)).world
  await setupPayments(h.db, world.admin)
})

const finance = () => h.actorFor('finance')

const reasonCopy = (variant: InvalidVariant) => textMessage('a reason', 2000, variant)

async function ledgerRows(entryType: 'refund' | 'returned_check' | 'chargeback' | 'correction') {
  return await h.db
    .select({
      amountCents: ledgerEntries.amountCents,
      reversesEntryId: ledgerEntries.reversesEntryId,
      reason: ledgerEntries.reason,
    })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.entryType, entryType))
}

describeActionCases(h, 'chargebackAction', {
  invoke: actions.chargebackAction,
  actor: finance,
  input: async () => ({
    entryId: (await cardPaymentOnFreshPermit(h.db, world)).entryId,
    disputeRef: `dp_${crypto.randomUUID()}`,
    amount: '10.00',
    reason: 'Cardholder disputed the charge',
  }),
  fields: {
    entryId: uuid({ required: true }),
    disputeRef: text({ required: true, max: 100 }),
    amount: money({ required: true }),
    reason: text({ required: true, max: 2000 }),
  },
  capability: 'payment.refund_void_correct',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      entryId: () => idMessage('a payment'),
      disputeRef: (v) => textMessage('the dispute reference', 100, v),
      amount: (v) => moneyMessage('the chargeback amount', v),
      reason: reasonCopy,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Chargeback recorded.' })
    expect(written).toEqual(expect.arrayContaining(['audit_log', 'ledger_entries']))
    expect(await ledgerRows('chargeback')).toContainEqual({
      amountCents: -1000,
      reversesEntryId: input.entryId,
      reason: 'Cardholder disputed the charge',
    })
  },
})

describeActionCases(h, 'correctAction', {
  invoke: actions.correctAction,
  actor: finance,
  input: async () => {
    const { entryId } = await paidOnFreshPermit(h.db, world, 'cash')
    const target = await submittedTrade(h.db, world)
    return {
      entryId,
      targetApplicationId: target.applicationId,
      amount: '45.00',
      reason: 'Keyed against the wrong permit',
    }
  },
  fields: {
    entryId: uuid({ required: true }),
    targetApplicationId: uuid({ required: true }),
    amount: money({ required: true }),
    reason: text({ required: true, max: 2000 }),
  },
  capability: 'payment.refund_void_correct',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      entryId: () => idMessage('a payment'),
      targetApplicationId: () => idMessage('a permit to move it to'),
      amount: (v) => moneyMessage('the amount to move', v),
      reason: reasonCopy,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({ ok: true, message: 'Correction recorded.' })
    expect(written).toEqual(expect.arrayContaining(['audit_log', 'ledger_entries']))
    expect(await ledgerRows('correction')).toContainEqual({
      amountCents: 0,
      reversesEntryId: input.entryId,
      reason: 'Keyed against the wrong permit',
    })
  },
})
