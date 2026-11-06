import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CHECK_ONLY_FIELD } from '@/constants/formCheck'
import { ledgerEntries } from '@/db/schema'
import { CHECK_PASSED, refuseField } from '@/server/formInput'
import type { PermitWorld } from '@/test/applicationFixtures'
import { idMessage, textMessage } from '@/test/boardCases'
import {
  moneyMessage,
  PAST_ONLY,
  pastDateMessage,
  useEnforcementClock,
} from '@/test/enforcementCases'
import { setupTradeWorld } from '@/test/ledgerFixtures'
import { FIXTURE_PAYMENT_CENTS, paidOnFreshPermit } from '@/test/paymentCaseFixtures'
import { setupPayments } from '@/test/paymentFixtures'
import { refusalBy } from '@/test/refusalCopy'
import {
  actionHarness,
  date,
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

const REASON = 'Permit pulled in error'
const SHORT_REASON_COPY = 'Enter a reason of at least 10 characters.'
const finance = () => h.actorFor('finance')

function checkOnly(fields: Record<string, string>): FormData {
  const form = h.form(fields)
  form.set(CHECK_ONLY_FIELD, '1')
  return form
}

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

describeActionCases(h, 'refundAction', {
  invoke: actions.refundAction,
  actor: finance,
  input: async () => {
    const { entryId, trade } = await paidOnFreshPermit(h.db, world, 'cash')
    return { entryId, applicationId: trade.applicationId, amount: '10.00', reason: REASON }
  },
  fields: {
    entryId: uuid({ required: true }),
    applicationId: uuid(),
    amount: money({ required: true }),
    reason: text({ required: true, max: 2000 }),
  },
  capability: 'payment.refund_void_correct',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      entryId: () => idMessage('a payment'),
      applicationId: () => 'Choose an application.',
      amount: (v) => moneyMessage('the refund amount', v),
      reason: reasonCopy,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({
      ok: true,
      message: expect.stringMatching(/^Refund recorded on receipt R-\d{4}-\d{6}\.$/),
    })
    expect(written).toEqual(
      expect.arrayContaining(['audit_log', 'ledger_entries', 'ledger_allocations', 'receipts']),
    )
    expect(await ledgerRows('refund')).toContainEqual({
      amountCents: -1000,
      reversesEntryId: input.entryId,
      reason: REASON,
    })
  },
})

describeActionCases(h, 'returnedCheckAction', {
  invoke: actions.returnedCheckAction,
  actor: finance,
  input: async () => ({
    entryId: (await paidOnFreshPermit(h.db, world, 'check')).entryId,
    returnedOn: '2027-07-15',
    reason: 'Insufficient funds notice',
  }),
  fields: {
    entryId: uuid({ required: true }),
    returnedOn: date({ required: true, ...PAST_ONLY }),
    reason: text({ required: true, max: 2000 }),
  },
  capability: 'payment.refund_void_correct',
  refusals: {
    ...STAFF_REFUSALS,
    invalid: refusalBy({
      entryId: () => idMessage('a payment'),
      returnedOn: (v) => pastDateMessage('the date returned', v),
      reason: reasonCopy,
    }),
    checkOnly: CHECK_PASSED,
  },
  accepted: async (result, { input, written }) => {
    expect(result).toEqual({
      ok: true,
      message: 'Returned check recorded. The permit state did not change.',
    })
    expect(written).toEqual(expect.arrayContaining(['audit_log', 'ledger_entries']))
    expect(await ledgerRows('returned_check')).toContainEqual({
      amountCents: -FIXTURE_PAYMENT_CENTS,
      reversesEntryId: input.entryId,
      reason: expect.stringContaining('Insufficient funds notice'),
    })
  },
})

describe('the sweep findings on refunds, returned checks and corrections', () => {
  it.each([
    ['0', 'Enter the refund amount from $0.01 to $10,000,000.00.'],
    ['-5', 'Enter the refund amount in dollars and cents, like 25.00.'],
    ['1.005', 'Enter the refund amount in dollars and cents, like 25.00.'],
    ['abc', 'Enter the refund amount in dollars and cents, like 25.00.'],
    ['   ', 'Enter the refund amount.'],
  ])('names the amount field for a refund of "%s" and refunds nothing', async (amount, copy) => {
    h.signIn(await finance())
    const { entryId } = await paidOnFreshPermit(h.db, world, 'cash')
    const outcome = await h.recordWrites(() =>
      actions.refundAction(h.form({ entryId, amount, reason: REASON })),
    )
    expect(outcome).toEqual({ value: refuseField('amount', copy), written: [] })
  })

  it('refuses a refund over what was paid beside the amount', async () => {
    h.signIn(await finance())
    const { entryId } = await paidOnFreshPermit(h.db, world, 'cash')
    const result = await actions.refundAction(h.form({ entryId, amount: '999.00', reason: REASON }))
    expect(result).toEqual(refuseField('amount', 'That is more than was paid.'))
  })

  it('checks a refund reason of 5 characters before the confirm opens', async () => {
    h.signIn(await finance())
    const { entryId } = await paidOnFreshPermit(h.db, world, 'cash')
    const outcome = await h.recordWrites(() =>
      actions.refundAction(checkOnly({ entryId, amount: '10.00', reason: 'short' })),
    )
    expect(outcome).toEqual({ value: refuseField('reason', SHORT_REASON_COPY), written: [] })
  })

  it('checks a returned check reason of 5 characters before the confirm opens', async () => {
    h.signIn(await finance())
    const { entryId } = await paidOnFreshPermit(h.db, world, 'check')
    const outcome = await h.recordWrites(() =>
      actions.returnedCheckAction(
        checkOnly({ entryId, returnedOn: '2027-07-15', reason: 'short' }),
      ),
    )
    expect(outcome).toEqual({ value: refuseField('reason', SHORT_REASON_COPY), written: [] })
  })

  it('refuses a returned check dated 2099 beside the date', async () => {
    h.signIn(await finance())
    const { entryId } = await paidOnFreshPermit(h.db, world, 'check')
    const result = await actions.returnedCheckAction(
      h.form({ entryId, returnedOn: '2099-01-01', reason: 'Insufficient funds notice' }),
    )
    expect(result).toEqual(
      refuseField(
        'returnedOn',
        'Enter the date returned between January 1, 1900 and July 20, 2027.',
      ),
    )
  })

  it('says a second returned check was already returned', async () => {
    h.signIn(await finance())
    const { entryId } = await paidOnFreshPermit(h.db, world, 'check')
    const fields = { entryId, returnedOn: '2027-07-15', reason: 'Insufficient funds notice' }
    expect((await actions.returnedCheckAction(h.form(fields))).ok).toBe(true)
    const second = await h.recordWrites(() => actions.returnedCheckAction(h.form(fields)))
    expect(second).toEqual({
      value: { ok: false, error: 'This check has already been recorded as returned.' },
      written: [],
    })
  })
})
